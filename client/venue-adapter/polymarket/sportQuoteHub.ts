/**
 * Polymarket 体育侧兼容 API（业务名）。
 * 行情总线见 `marketQuoteHub`：多消费者 register；collector stop 只注销 esport。
 */

import {
  hasPolymarketQuoteConsumerAsset,
  getPolymarketQuoteConsumerAssetIds,
  onPolymarketMarketHubReady,
  onPolymarketMarketQuote,
  registerPolymarketQuoteAssets,
  unregisterPolymarketQuoteConsumer,
  type PolymarketMarketQuote,
} from "./marketQuoteHub";

export type PolymarketSportQuote = PolymarketMarketQuote;

const CONSUMER = "sport" as const;

export function getPolymarketSportAssetIds(): string[] {
  return getPolymarketQuoteConsumerAssetIds(CONSUMER);
}

/** @param force transport 重建后强制重订 */
export function setPolymarketSportAssetIds(assetIds: string[], force = false): void {
  registerPolymarketQuoteAssets(CONSUMER, assetIds, force);
}

/** 板子会话：hub (re)start 后 force sync */
export function onPolymarketSportHubBound(fn: () => void): () => void {
  return onPolymarketMarketHubReady(fn);
}

/** 仅转发给已登记体育 asset 的报价（不写 fo） */
export function onPolymarketSportQuote(fn: (quote: PolymarketSportQuote) => void): () => void {
  return onPolymarketMarketQuote((q) => {
    if (!hasPolymarketQuoteConsumerAsset(CONSUMER, q.assetId))
      return;
    fn(q);
  });
}

/** 关 Tab / 测例：注销体育消费者（不影响 esport） */
export function clearPolymarketSportHub(): void {
  unregisterPolymarketQuoteConsumer(CONSUMER);
}
