import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { PolymarketOrderRow, PolymarketPollOutcome } from "./orderTypes";
import { settlePolymarketDelayedOrder } from "./orderSettlement";

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

const jobs = new Map<string, SettlementJobEntry>();

function settlementJobKey(accountId: number, orderId: string): string {
  return `${accountId}:${orderId}`;
}

async function runSettlementJob(
  account: PlatformAccount,
  orderId: string,
  opts?: {
    side?: "BUY" | "SELL";
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
  },
): Promise<PolymarketSettlementPayload> {
  const payload = await settlePolymarketDelayedOrder(account, orderId, opts);
  if (!payload)
    return { outcome: "timeout", row: null };
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
