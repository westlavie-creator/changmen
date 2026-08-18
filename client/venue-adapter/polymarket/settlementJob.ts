import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { PolymarketOrderRow, PolymarketPollOutcome } from "./orderTypes";
import { coercePolymarketFokPollOutcome } from "./orderStatus";
import { settlePolymarketDelayedOrder } from "./orderSettlement";

/** POST delayed 后后台 settle；finalize 仍 A8 wait→sync，sync 时 await 本 Job。outcome 已经过 FOK coerce，不含 timeout。 */
export interface PolymarketSettlementPayload {
  outcome: Exclude<PolymarketPollOutcome, "timeout">;
  row: PolymarketOrderRow | null;
}

export type PolymarketDelayedPollOpts = {
  initialDelayMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
};

export type PolymarketSettlementJobOpts = {
  side?: "BUY" | "SELL";
  poll?: PolymarketDelayedPollOpts;
  tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
  /** CLOB condition_id；Job 掉了后 fallback 再拉 sd */
  conditionId?: string;
};

interface SettlementJobEntry {
  promise: Promise<PolymarketSettlementPayload>;
  startedAt: number;
}

interface SettlementDelayCtx {
  poll?: PolymarketDelayedPollOpts;
  conditionId?: string;
}

const JOB_TTL_MS = 60_000;
const DELAY_CTX_TTL_MS = 120_000;

const jobs = new Map<string, SettlementJobEntry>();
const delayCtx = new Map<string, SettlementDelayCtx>();

function settlementJobKey(accountId: number, orderId: string): string {
  return `${accountId}:${orderId}`;
}

function rememberDelayCtx(key: string, opts?: PolymarketSettlementJobOpts): void {
  if (!opts?.poll && !opts?.conditionId)
    return;
  delayCtx.set(key, {
    poll: opts.poll,
    conditionId: opts.conditionId,
  });
  setTimeout(() => {
    delayCtx.delete(key);
  }, DELAY_CTX_TTL_MS);
}

export function getPolymarketSettlementDelayCtx(
  account: PlatformAccount,
  orderId: string,
): SettlementDelayCtx | null {
  const id = String(orderId ?? "").trim();
  const accountId = account.accountId;
  if (!id || accountId == null)
    return null;
  return delayCtx.get(settlementJobKey(accountId, id)) ?? null;
}

async function runSettlementJob(
  account: PlatformAccount,
  orderId: string,
  opts?: PolymarketSettlementJobOpts,
): Promise<PolymarketSettlementPayload> {
  const payload = await settlePolymarketDelayedOrder(account, orderId, opts);
  if (!payload)
    return { outcome: "unfilled", row: null };
  return {
    outcome: coercePolymarketFokPollOutcome(payload.outcome),
    row: payload.row,
  };
}

/**
 * [changmen 扩展] POST success + delayed 后立即启动；幂等。
 * 与 registerPolymarketOrderWatch 配合：wait(q) 期间 WS/REST 已在跑。
 */
export function startPolymarketSettlementJob(
  account: PlatformAccount,
  orderId: string,
  opts?: PolymarketSettlementJobOpts,
): void {
  const id = String(orderId ?? "").trim();
  const accountId = account.accountId;
  if (!id || accountId == null)
    return;

  const key = settlementJobKey(accountId, id);
  rememberDelayCtx(key, opts);
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

/** 单笔 Job 清除（旧 timeout 缓存清掉再 settle） */
export function clearPolymarketSettlementJob(
  account: PlatformAccount,
  orderId: string,
): void {
  const id = String(orderId ?? "").trim();
  const accountId = account.accountId;
  if (!id || accountId == null)
    return;
  jobs.delete(settlementJobKey(accountId, id));
}

/** User WS 全停时一并清理（单测 / 登出） */
export function clearPolymarketSettlementJobs(): void {
  jobs.clear();
  delayCtx.clear();
}
