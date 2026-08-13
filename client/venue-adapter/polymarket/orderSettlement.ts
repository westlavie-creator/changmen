import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { PolymarketOrderRow, PolymarketPollOutcome } from "./orderTypes";
import { fetchPolymarketConfirmedTradeForOrder } from "./orders";
import {
  POLYMARKET_WS_FALLBACK_POLL_OPTS,
  POLYMARKET_WS_FALLBACK_TRADE_CONFIRM_OPTS,
  pollPolymarketDelayedOrder,
} from "./orderStatus";
import { awaitPolymarketOrderWatch, clearPolymarketOrderWatch } from "./userWs";

function wait(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
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
  // WS 已报 Cancellation 且 REST 未发现成交 → 确认 unfilled
  if (wsResult?.outcome === "unfilled" && rest.outcome !== "matched")
    return { outcome: "unfilled", row: rest.row ?? wsResult.row };
  return rest;
}
