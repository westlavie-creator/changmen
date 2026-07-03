import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@venue/contract";
import { POLYMARKET_CLOB_API } from "./api";
import { buildL2Headers, resolveApiCreds, parseTokenConfig } from "./l2Auth";
import { polymarketPluginGet } from "./transport";

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

function parseMatchedSize(row: PolymarketOrderRow | null | undefined): number {
  const matched = Number(row?.size_matched);
  return Number.isFinite(matched) && matched > 0 ? matched : 0;
}

/** GET /data/order/{id} 行解读 */
export function interpretPolymarketOrderRow(
  row: PolymarketOrderRow | null | undefined,
): "matched" | "unfilled" | "pending" {
  if (!row || Object.keys(row).length === 0)
    return "unfilled";
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
