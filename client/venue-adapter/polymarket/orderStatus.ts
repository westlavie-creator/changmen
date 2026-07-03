import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@venue/contract";
import { POLYMARKET_CLOB_API } from "./api";
import { buildL2Headers, resolveApiCreds, parseTokenConfig } from "./l2Auth";
import { fetchPolymarketConfirmedTradeForOrder } from "./orders";
import { polymarketPluginGet } from "./transport";
import { awaitPolymarketOrderWatch, clearPolymarketOrderWatch } from "./userWs";

const ORDER_PATH_PREFIX = "/data/order/";

export interface PolymarketOrderResponseLike {
  success?: boolean;
  status?: string;
  orderID?: string;
  takingAmount?: string | number;
}

export interface PolymarketOrderRow {
  id?: string;
  status?: string;
  size_matched?: string | number;
  original_size?: string | number;
  associate_trades?: string[];
  order_type?: string;
}

/** POST /order 返回 delayed 且尚无 takingAmount：延迟窗内，未最终成交 */
export function isPolymarketDelayedPending(
  result: PolymarketOrderResponseLike | null | undefined,
): boolean {
  if (!result?.success)
    return false;
  const status = String(result.status ?? "").trim().toLowerCase();
  if (status !== "delayed")
    return false;
  const orderId = String(result.orderID ?? "").trim();
  if (!orderId)
    return false;
  const taking = Number(result.takingAmount);
  return !(Number.isFinite(taking) && taking > 0);
}

/** POST 已 matched 且 takingAmount>0：勿因 getOrders 滞后误判拒单 */
export function isPolymarketPostFillConfirmed(
  response: PolymarketOrderResponseLike | null | undefined,
): boolean {
  if (!response?.success)
    return false;
  const status = String(response.status ?? "").trim().toLowerCase();
  if (status !== "matched")
    return false;
  const taking = Number(response.takingAmount);
  return Number.isFinite(taking) && taking > 0;
}

export function isPolymarketBetResultFillConfirmed(result: BetResult): boolean {
  if (!result.success || result.pending)
    return false;
  const orderId = String(result.orderId ?? "").trim();
  if (!orderId)
    return false;
  return isPolymarketPostFillConfirmed(
    result.response as PolymarketOrderResponseLike | undefined,
  );
}

/** 仅当本单 orderId 在列表中为 reject 时判拒；列表滞后时不继承其它旧拒单 */
export function isPolymarketOrderIdRejected(
  orders: VenueOrder[],
  orderId: string | null | undefined,
): boolean {
  const id = String(orderId ?? "").trim();
  if (!id)
    return orders.length > 0 && orders[0].status === "reject";
  const ours = orders.find(o => o.orderId === id);
  if (ours)
    return ours.status === "reject";
  return false;
}

function parseMatchedSize(row: PolymarketOrderRow | null | undefined): number {
  const matched = Number(row?.size_matched);
  return Number.isFinite(matched) && matched > 0 ? matched : 0;
}

/** GET /data/order/{id} 行解读 */
export function interpretPolymarketOrderRow(
  row: PolymarketOrderRow | null | undefined,
): "matched" | "unfilled" | "pending" {
  // 端点暂未返回 / 404：体育 delay 窗内常见，勿误判为 FOK 拒单
  if (!row)
    return "pending";
  if (Object.keys(row).length === 0)
    return "pending";
  const status = String(row.status ?? "").trim().toLowerCase();
  if (parseMatchedSize(row) > 0)
    return "matched";
  const trades = row.associate_trades;
  if (Array.isArray(trades) && trades.length > 0)
    return "matched";
  if (
    status.includes("cancel")
    || status.includes("kill")
    || status === "unmatched"
    || status === "expired"
  ) {
    return "unfilled";
  }
  if (status === "matched" && parseMatchedSize(row) === 0)
    return "unfilled";
  if (status === "delayed" || status === "live")
    return "pending";
  return "pending";
}

export async function fetchPolymarketOrderRow(
  account: PlatformAccount,
  orderId: string,
): Promise<PolymarketOrderRow | null> {
  const id = String(orderId ?? "").trim();
  if (!id)
    return null;
  const config = parseTokenConfig(account.token);
  const creds = resolveApiCreds(config);
  if (!creds.apiKey || !creds.secret || !creds.passphrase || !creds.address)
    return null;
  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const path = `${ORDER_PATH_PREFIX}${id}`;
  const headers = await buildL2Headers(
    creds.address,
    creds.apiKey,
    creds.secret,
    creds.passphrase,
    "GET",
    path,
  );
  try {
    const data = await polymarketPluginGet<PolymarketOrderRow | null>(`${gateway}${path}`, { headers });
    return data ?? null;
  }
  catch {
    return null;
  }
}

function wait(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

export type PolymarketPollOutcome = "matched" | "unfilled" | "timeout";

/**
 * 体育 delayed 轮询（对齐官网 [Order Lifecycle](https://docs.polymarket.com/concepts/order-lifecycle)）：
 * - 体育盘 marketable 单进入「秒级 delay 窗」，常见约 1s，POST 先返回 `delayed`
 * - 加密/金融 taker delay 仅 250ms，且 API 会同步等到最终结果（通常不返回 delayed）
 * 故 order 轮询不必分钟级：1s 起步 + 12 次 × 1s ≈ 13s，覆盖 delay 窗与接口滞后。
 */
export const POLYMARKET_SPORTS_DELAYED_POLL_OPTS = {
  initialDelayMs: 1_000,
  intervalMs: 1_000,
  maxAttempts: 12,
} as const;

/**
 * order 仍 pending 时用 /data/trades 兜底（官网：成交后 MATCHED→MINED→CONFIRMED，链上需额外时间）。
 * 最多约 30s，应对 order 端点滞后于 trades 的情况（你遇到的误拒单主因）。
 */
export const POLYMARKET_DELAYED_TRADE_CONFIRM_OPTS = {
  lookbackMs: 10 * 60 * 1000,
  retryMs: 2_000,
  maxRetries: 15,
} as const;

export async function pollPolymarketDelayedOrder(
  account: PlatformAccount,
  orderId: string,
  opts?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number },
): Promise<{ outcome: PolymarketPollOutcome; row: PolymarketOrderRow | null }> {
  const initialDelayMs = opts?.initialDelayMs ?? 2000;
  const intervalMs = opts?.intervalMs ?? 2000;
  const maxAttempts = opts?.maxAttempts ?? 15;
  await wait(initialDelayMs);
  let last: PolymarketOrderRow | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    last = await fetchPolymarketOrderRow(account, orderId);
    const state = interpretPolymarketOrderRow(last);
    if (state === "matched")
      return { outcome: "matched", row: last };
    if (state === "unfilled")
      return { outcome: "unfilled", row: last };
    if (i < maxAttempts - 1)
      await wait(intervalMs);
  }
  return { outcome: "timeout", row: last };
}

/** WS 未命中后的 REST 轮询（保留 1s 起步，覆盖体育 delay 窗与 order 端点滞后） */
export const POLYMARKET_WS_FALLBACK_POLL_OPTS = {
  initialDelayMs: POLYMARKET_SPORTS_DELAYED_POLL_OPTS.initialDelayMs,
  intervalMs: POLYMARKET_SPORTS_DELAYED_POLL_OPTS.intervalMs,
  maxAttempts: 6,
} as const;

export const POLYMARKET_WS_FALLBACK_TRADE_CONFIRM_OPTS = {
  lookbackMs: 10 * 60 * 1000,
  retryMs: 2_000,
  maxRetries: 8,
} as const;

async function settlePolymarketDelayedOrderViaRest(
  account: PlatformAccount,
  orderId: string,
  opts?: {
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
  },
): Promise<{ outcome: PolymarketPollOutcome; row: PolymarketOrderRow | null }> {
  const pollOpts = { ...POLYMARKET_WS_FALLBACK_POLL_OPTS, ...opts?.poll };
  const tradeConfirm = { ...POLYMARKET_WS_FALLBACK_TRADE_CONFIRM_OPTS, ...opts?.tradeConfirm };
  const { outcome, row } = await pollPolymarketDelayedOrder(account, orderId, pollOpts);
  if (outcome === "matched")
    return { outcome, row };

  for (let i = 0; i < tradeConfirm.maxRetries; i++) {
    const trade = await fetchPolymarketConfirmedTradeForOrder(
      account,
      orderId,
      tradeConfirm.lookbackMs,
    );
    if (trade) {
      return {
        outcome: "matched",
        row: {
          status: "MATCHED",
          size_matched: String(trade.size ?? ""),
          associate_trades: trade.id ? [String(trade.id)] : undefined,
        },
      };
    }
    if (i < tradeConfirm.maxRetries - 1)
      await wait(tradeConfirm.retryMs);
  }

  return { outcome, row };
}

export async function settlePolymarketDelayedOrder(
  account: PlatformAccount,
  orderId: string,
  opts?: {
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
  },
): Promise<{ outcome: PolymarketPollOutcome; row: PolymarketOrderRow | null }> {
  const wsResult = await awaitPolymarketOrderWatch(orderId);
  clearPolymarketOrderWatch(orderId);
  if (wsResult?.outcome === "matched" || wsResult?.outcome === "unfilled") {
    return { outcome: wsResult.outcome, row: wsResult.row };
  }

  return settlePolymarketDelayedOrderViaRest(account, orderId, opts);
}

export function formatPolymarketSettlementMessage(
  orderId: string,
  outcome: PolymarketPollOutcome,
  row: PolymarketOrderRow | null,
): string {
  const id = String(orderId).trim();
  if (outcome === "matched") {
    const size = parseMatchedSize(row);
    const status = String(row?.status ?? "matched").trim();
    return `${id} / ${status} / 已成交${size > 0 ? ` ${size} shares` : ""}`;
  }
  if (outcome === "unfilled")
    return `${id} / 未成交 / FOK 延迟后未吃满已取消`;
  return `${id} / 待确认超时 / 请刷新账号订单或上官网核对`;
}

/** 拒单检测收尾：更新 BetResult 文案并清除 pending */
export function applyPolymarketSettlementToResult(
  result: BetResult,
  outcome: PolymarketPollOutcome,
  row: PolymarketOrderRow | null,
): void {
  result.pending = false;
  result.message = formatPolymarketSettlementMessage(String(result.orderId ?? ""), outcome, row);
  if (outcome === "unfilled" || outcome === "timeout")
    result.reject = outcome;
}

/** PM FOK 未成交：合成 reject 订单供 isVenueReject 统一判定 */
export function buildPolymarketRejectVenueOrder(
  account: PlatformAccount,
  result: BetResult,
  outcome: "unfilled" | "timeout",
): VenueOrder {
  return {
    provider: account.provider,
    orderId: String(result.orderId ?? ""),
    odds: 0,
    createAt: Date.now(),
    betMoney: 0,
    reward: 0,
    money: 0,
    status: "reject",
    game: "",
    match: "",
    bet: outcome === "timeout" ? "待确认超时" : "FOK未成交",
    item: "",
  };
}
