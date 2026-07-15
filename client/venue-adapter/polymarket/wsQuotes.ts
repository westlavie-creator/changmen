/**
 * Polymarket CLOB market 行情解析（数据源层，无业务副作用）。
 */
import type { PolymarketWsMessage } from "./api";
import { bestAskFromBook } from "./parse";

export function extractPolymarketWsBestAsks(raw: string): Array<{ assetId: string; bestAsk: string | number }> {
  if (raw === "PONG") return [];
  const parsed = JSON.parse(raw) as PolymarketWsMessage | PolymarketWsMessage[];
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const updates: Array<{ assetId: string; bestAsk: string | number }> = [];
  for (const msg of messages) {
    if (msg.event_type === "best_bid_ask" && msg.asset_id && msg.best_ask !== undefined) {
      updates.push({ assetId: String(msg.asset_id), bestAsk: msg.best_ask });
    }
    else if (msg.event_type === "price_change" && Array.isArray(msg.price_changes)) {
      for (const change of msg.price_changes) {
        if (change.asset_id && change.best_ask !== undefined) {
          updates.push({ assetId: String(change.asset_id), bestAsk: change.best_ask });
        }
      }
    }
    else if (msg.event_type === "book" && msg.asset_id) {
      const bestAsk = bestAskFromBook({ asks: msg.asks });
      if (bestAsk > 0)
        updates.push({ assetId: String(msg.asset_id), bestAsk });
    }
  }
  return updates;
}
