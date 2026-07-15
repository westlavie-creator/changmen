/**
 * Polymarket market-WS 体育旁路注册表。
 * 与电竞 collector 共用同一 WS 订阅集合；报价禁止写入 fo。
 */

export interface PolymarketSportQuote {
  assetId: string;
  bestAsk: number;
}

type SportQuoteListener = (quote: PolymarketSportQuote) => void;

const sportAssetIds = new Set<string>();
const listeners = new Set<SportQuoteListener>();

/** collector 启动后挂上的重订阅钩子（合并电竞+体育 asset 后 send） */
let requestResubscribe: (() => void) | null = null;

export function bindPolymarketSportResubscribe(fn: (() => void) | null): void {
  requestResubscribe = fn;
}

export function getPolymarketSportAssetIds(): string[] {
  return [...sportAssetIds];
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

/**
 * 替换体育侧要订的 CLOB token；空数组 = 不再订体育。
 * 集合未变则 **不** 触发重订（避免棒/足 30s 列表刷把电竞 WS 打成 initialDump）。
 */
export function setPolymarketSportAssetIds(assetIds: string[]): void {
  if (sameIdSet(sportAssetIds, assetIds))
    return;
  sportAssetIds.clear();
  for (const id of assetIds) {
    const s = String(id || "").trim();
    if (s)
      sportAssetIds.add(s);
  }
  requestResubscribe?.();
}

export function onPolymarketSportQuote(fn: SportQuoteListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** collector WS 回调：仅广播，不写 fo。 */
export function emitPolymarketSportQuote(assetId: string, bestAsk: number): void {
  // 未开体育会话：尽快返回，不挡电竞热路径
  if (!sportAssetIds.size || !listeners.size)
    return;
  if (!sportAssetIds.has(assetId))
    return;
  if (!Number.isFinite(bestAsk) || bestAsk <= 0)
    return;
  const quote = { assetId, bestAsk };
  for (const fn of listeners) {
    try {
      fn(quote);
    }
    catch (err) {
      console.warn("[Polymarket] sport quote listener", err);
    }
  }
}

/**
 * collector stop：清体育订阅与重订钩子。
 * **保留** listeners —— 棒/足板会话在 collector 重启后仍可重新 setSportAssetIds。
 */
export function clearPolymarketSportHub(): void {
  sportAssetIds.clear();
  requestResubscribe = null;
}
