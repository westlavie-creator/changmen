import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { PolymarketOrderRow, PolymarketPollOutcome } from "./orderTypes";
import { fetchPolymarketConfirmedTradeForOrder } from "./orders";
import { pmCancelOrder } from "./pmClientApi";
import {
  POLYMARKET_WS_FALLBACK_POLL_OPTS,
  POLYMARKET_WS_FALLBACK_TRADE_CONFIRM_OPTS,
  fetchPolymarketOrderRow,
  interpretPolymarketOrderRow,
  isPolymarketRestingNoFill,
  pollPolymarketDelayedOrder,
} from "./orderStatus";
import { awaitPolymarketOrderWatch, clearPolymarketOrderWatch } from "./userWs";

function wait(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

/** FOK：delay 撮合试完后，给系统 kill 的短窗口（官网无 SLA，取数秒） */
export const POLYMARKET_FOK_RESTING_GRACE_MS = 4_000;
export const POLYMARKET_FOK_RESTING_GRACE_INTERVAL_MS = 1_000;
export const POLYMARKET_FOK_POST_CANCEL_ATTEMPTS = 4;
export const POLYMARKET_FOK_POST_CANCEL_INTERVAL_MS = 500;

async function lookupTradeMatched(
  account: PlatformAccount,
  orderId: string,
  side: "BUY" | "SELL",
  lookbackMs: number,
): Promise<{ outcome: "matched"; row: PolymarketOrderRow } | null> {
  const trade = await fetchPolymarketConfirmedTradeForOrder(
    account,
    orderId,
    lookbackMs,
    side,
  );
  if (!trade)
    return null;
  return {
    outcome: "matched",
    row: {
      status: "MATCHED",
      size_matched: String(trade.size ?? ""),
      associate_trades: trade.id ? [String(trade.id)] : undefined,
    },
  };
}

/**
 * FOK 残留挂簿收尾：短 grace 等系统 cancel/matched；仍挂簿则一次 cancel 再复核。
 * delayed / 非挂簿 → 不撤，保持原 outcome。
 */
export async function finalizePolymarketFokRestingOrder(
  account: PlatformAccount,
  orderId: string,
  row: PolymarketOrderRow | null,
  opts?: {
    side?: "BUY" | "SELL";
    lookbackMs?: number;
    graceMs?: number;
    graceIntervalMs?: number;
    postCancelAttempts?: number;
    postCancelIntervalMs?: number;
  },
): Promise<{ outcome: PolymarketPollOutcome; row: PolymarketOrderRow | null }> {
  const side = opts?.side ?? "BUY";
  const lookbackMs = opts?.lookbackMs ?? 10 * 60 * 1000;
  const graceMs = opts?.graceMs ?? POLYMARKET_FOK_RESTING_GRACE_MS;
  const graceIntervalMs = opts?.graceIntervalMs ?? POLYMARKET_FOK_RESTING_GRACE_INTERVAL_MS;
  const postCancelAttempts = opts?.postCancelAttempts ?? POLYMARKET_FOK_POST_CANCEL_ATTEMPTS;
  const postCancelIntervalMs = opts?.postCancelIntervalMs ?? POLYMARKET_FOK_POST_CANCEL_INTERVAL_MS;

  let last = row;
  if (!isPolymarketRestingNoFill(last)) {
    const state = interpretPolymarketOrderRow(last);
    if (state === "matched")
      return { outcome: "matched", row: last };
    if (state === "unfilled")
      return { outcome: "unfilled", row: last };
    return { outcome: "timeout", row: last };
  }

  const graceDeadline = Date.now() + graceMs;
  while (Date.now() < graceDeadline) {
    const traded = await lookupTradeMatched(account, orderId, side, lookbackMs);
    if (traded)
      return traded;
    last = await fetchPolymarketOrderRow(account, orderId);
    const state = interpretPolymarketOrderRow(last);
    if (state === "matched")
      return { outcome: "matched", row: last };
    if (state === "unfilled")
      return { outcome: "unfilled", row: last };
    if (!isPolymarketRestingNoFill(last))
      return { outcome: state === "pending" ? "timeout" : state, row: last };
    await wait(graceIntervalMs);
  }

  try {
    await pmCancelOrder(account, orderId);
  }
  catch {
    /* cancel 失败仍复核；可能已系统 cancel 或竞态成交 */
  }

  for (let i = 0; i < postCancelAttempts; i++) {
    const traded = await lookupTradeMatched(account, orderId, side, lookbackMs);
    if (traded)
      return traded;
    last = await fetchPolymarketOrderRow(account, orderId);
    const state = interpretPolymarketOrderRow(last);
    if (state === "matched")
      return { outcome: "matched", row: last };
    if (state === "unfilled")
      return { outcome: "unfilled", row: last };
    if (!isPolymarketRestingNoFill(last) && state === "pending")
      return { outcome: "timeout", row: last };
    if (i < postCancelAttempts - 1)
      await wait(postCancelIntervalMs);
  }

  // 仍挂簿：勿谎报未成交
  return { outcome: "timeout", row: last };
}

async function settlePolymarketDelayedOrderViaRest(
  account: PlatformAccount,
  orderId: string,
  opts?: {
    side?: "BUY" | "SELL";
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
  },
): Promise<{ outcome: PolymarketPollOutcome; row: PolymarketOrderRow | null }> {
  const side = opts?.side ?? "BUY";
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
      side,
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
    side?: "BUY" | "SELL";
    poll?: { initialDelayMs?: number; intervalMs?: number; maxAttempts?: number };
    tradeConfirm?: { lookbackMs?: number; retryMs?: number; maxRetries?: number };
    fokGrace?: {
      graceMs?: number;
      graceIntervalMs?: number;
      postCancelAttempts?: number;
      postCancelIntervalMs?: number;
    };
  },
): Promise<{ outcome: PolymarketPollOutcome; row: PolymarketOrderRow | null }> {
  const wsResult = await awaitPolymarketOrderWatch(orderId);
  clearPolymarketOrderWatch(orderId);
  // 官方：WS matched 可采信；WS unfilled 仍须 REST/trades 权威确认（防误杀）
  if (wsResult?.outcome === "matched")
    return { outcome: "matched", row: wsResult.row };

  const rest = await settlePolymarketDelayedOrderViaRest(account, orderId, opts);
  if (rest.outcome === "matched")
    return rest;
  if (rest.outcome === "unfilled")
    return rest;

  // WS Cancellation：须 trades 已排除成交；若 REST 仍挂簿则走 FOK 收尾（防状态滞后假未成交）
  if (wsResult?.outcome === "unfilled") {
    if (isPolymarketRestingNoFill(rest.row)) {
      const lookbackMs = {
        ...POLYMARKET_WS_FALLBACK_TRADE_CONFIRM_OPTS,
        ...opts?.tradeConfirm,
      }.lookbackMs;
      return finalizePolymarketFokRestingOrder(account, orderId, rest.row, {
        side: opts?.side ?? "BUY",
        lookbackMs,
        ...opts?.fokGrace,
      });
    }
    return { outcome: "unfilled", row: rest.row ?? wsResult.row };
  }

  // poll timeout / 仍 pending：若挂簿残留则 FOK grace + 一次 cancel
  if (isPolymarketRestingNoFill(rest.row)) {
    const lookbackMs = {
      ...POLYMARKET_WS_FALLBACK_TRADE_CONFIRM_OPTS,
      ...opts?.tradeConfirm,
    }.lookbackMs;
    return finalizePolymarketFokRestingOrder(account, orderId, rest.row, {
      side: opts?.side ?? "BUY",
      lookbackMs,
      ...opts?.fokGrace,
    });
  }

  return rest;
}
