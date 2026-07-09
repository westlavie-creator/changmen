import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { PolymarketOrderRow, PolymarketPollOutcome } from "./orderTypes";
import { settlePolymarketDelayedOrder } from "./orderSettlement";
import { resolvePolymarketBuyFill } from "./orders";
import { placePolymarketAutoExitSell } from "./pmAutoExitSell";

/** POST delayed 后后台 settle；finalize 仍 A8 wait→sync，sync 时 await 本 Job */
export interface PolymarketSettlementPayload {
  outcome: PolymarketPollOutcome;
  row: PolymarketOrderRow | null;
}

interface SettlementJobEntry {
  promise: Promise<PolymarketSettlementPayload>;
  startedAt: number;
}

const JOB_TTL_MS = 60_000;

/** delayed 撮合后 trades 可能略滞后；仅在解析到确认成交份数后才挂卖单 */
const AUTO_EXIT_FILL_RETRY = {
  maxAttempts: 8,
  retryMs: 1_500,
} as const;

const jobs = new Map<string, SettlementJobEntry>();

function settlementJobKey(accountId: number, orderId: string): string {
  return `${accountId}:${orderId}`;
}

function waitMs(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * 必须拿到确认成交份数才挂止盈：
 * - 优先 POST making/taking（即时 matched）
 * - 否则 /data/trades 已确认成交（MATCHED/MINED/CONFIRMED）
 * - 仅有 order 行 size_matched、尚无 trade → 不算确认，不挂
 */
async function resolveConfirmedBuySharesForAutoExit(
  account: PlatformAccount,
  orderId: string,
): Promise<number> {
  for (let i = 0; i < AUTO_EXIT_FILL_RETRY.maxAttempts; i++) {
    const fill = await resolvePolymarketBuyFill(account, orderId, null);
    if (fill.shares > 0)
      return fill.shares;
    if (i < AUTO_EXIT_FILL_RETRY.maxAttempts - 1)
      await waitMs(AUTO_EXIT_FILL_RETRY.retryMs);
  }
  return 0;
}

async function maybeAutoExitAfterDelayedBuyConfirmed(
  account: PlatformAccount,
  orderId: string,
  tokenId: string,
): Promise<void> {
  const shares = await resolveConfirmedBuySharesForAutoExit(account, orderId);
  if (!(shares > 0)) {
    console.warn(
      `[Polymarket] auto-exit skip: delayed 单 ${orderId} 尚未确认成交份数（不挂卖单）`,
    );
    return;
  }
  const r = await placePolymarketAutoExitSell({
    account,
    buyOrderId: orderId,
    tokenId,
    shares,
  });
  if (r.ok) {
    const dup = r.skippedDuplicate ? " (已有 open SELL，跳过)" : "";
    console.info(
      `[Polymarket] auto-exit(confirmed) GTC SELL @ ${r.price} shares=${r.shares} sellOrder=${r.sellOrderId}${dup}`,
    );
    return;
  }
  console.warn(`[Polymarket] auto-exit(confirmed) failed buy=${orderId}: ${r.error}`);
}

async function runSettlementJob(
  account: PlatformAccount,
  orderId: string,
  opts?: {
    side?: "BUY" | "SELL";
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
    autoExitSell?: { tokenId: string };
  },
): Promise<PolymarketSettlementPayload> {
  const payload = await settlePolymarketDelayedOrder(account, orderId, opts);
  if (!payload)
    return { outcome: "timeout", row: null };

  const tokenId = String(opts?.autoExitSell?.tokenId ?? "").trim();
  // settlement outcome=matched 只表示订单侧已撮合线索；挂卖单仍须 resolveConfirmedBuyShares
  if (payload.outcome === "matched" && tokenId && (opts?.side ?? "BUY") === "BUY") {
    void maybeAutoExitAfterDelayedBuyConfirmed(account, orderId, tokenId).catch((err) => {
      console.warn("[Polymarket] auto-exit(confirmed) unexpected error", err);
    });
  }
  return payload;
}

/**
 * [changmen 扩展] POST success + delayed 后立即启动；幂等。
 * 与 registerPolymarketOrderWatch 配合：wait(q) 期间 WS/REST 已在跑。
 */
export function startPolymarketSettlementJob(
  account: PlatformAccount,
  orderId: string,
  opts?: {
    side?: "BUY" | "SELL";
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
    autoExitSell?: { tokenId: string };
  },
): void {
  const id = String(orderId ?? "").trim();
  const accountId = account.accountId;
  if (!id || accountId == null)
    return;

  const key = settlementJobKey(accountId, id);
  if (jobs.has(key))
    return;

  const promise = runSettlementJob(account, id, opts).finally(() => {
    setTimeout(() => {
      jobs.delete(key);
    }, JOB_TTL_MS);
  });

  jobs.set(key, { promise, startedAt: Date.now() });
}

/** sync / jb 消费；无 Job 时返回 null → fallback settlePolymarketDelayedOrder */
export async function awaitPolymarketSettlementJob(
  account: PlatformAccount,
  orderId: string,
): Promise<PolymarketSettlementPayload | null> {
  const id = String(orderId ?? "").trim();
  const accountId = account.accountId;
  if (!id || accountId == null)
    return null;

  const entry = jobs.get(settlementJobKey(accountId, id));
  if (!entry)
    return null;
  return entry.promise;
}

/** User WS 全停时一并清理（单测 / 登出） */
export function clearPolymarketSettlementJobs(): void {
  jobs.clear();
}
