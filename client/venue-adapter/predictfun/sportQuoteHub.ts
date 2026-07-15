/**
 * PredictFun orderbook-WS 体育旁路注册表。
 * 与电竞 collector 共用订阅；报价禁止写入 fo。
 */

export interface PredictFunSportQuote {
  marketId: string;
  bestAsk: number;
}

type SportQuoteListener = (quote: PredictFunSportQuote) => void;

const sportMarketIds = new Set<string>();
const listeners = new Set<SportQuoteListener>();
let requestResubscribe: (() => void) | null = null;

export function bindPredictFunSportResubscribe(fn: (() => void) | null): void {
  requestResubscribe = fn;
}

export function getPredictFunSportMarketIds(): string[] {
  return [...sportMarketIds];
}

function sameIdSet(prev: Set<string>, next: string[]): boolean {
  const cleaned = [...new Set(next.map(id => String(id || "").trim()).filter(Boolean))];
  if (cleaned.length !== prev.size)
    return false;
  for (const id of cleaned) {
    if (!prev.has(id))
      return false;
  }
  return true;
}

/** 集合未变不重订，避免列表轮询反复 subscribe 全量电竞 market。 */
export function setPredictFunSportMarketIds(marketIds: string[]): void {
  if (sameIdSet(sportMarketIds, marketIds))
    return;
  sportMarketIds.clear();
  for (const id of marketIds) {
    const s = String(id || "").trim();
    if (s)
      sportMarketIds.add(s);
  }
  requestResubscribe?.();
}

export function onPredictFunSportQuote(fn: SportQuoteListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitPredictFunSportQuote(marketId: string, bestAsk: number): void {
  if (!sportMarketIds.size || !listeners.size)
    return;
  if (!sportMarketIds.has(marketId))
    return;
  if (!Number.isFinite(bestAsk) || bestAsk <= 0 || bestAsk >= 1)
    return;
  const quote = { marketId, bestAsk };
  for (const fn of listeners) {
    try {
      fn(quote);
    }
    catch (err) {
      console.warn("[PredictFun] sport quote listener", err);
    }
  }
}

/**
 * collector stop：清体育订阅与重订钩子，保留 listeners（板子会话可再登记）。
 */
export function clearPredictFunSportHub(): void {
  sportMarketIds.clear();
  requestResubscribe = null;
}
