/**
 * [Polymarket 可证实] 限价必须对齐市场 tick，否则 INVALID_ORDER_MIN_TICK_SIZE。
 * @see https://docs.polymarket.com/trading/orders/overview
 */

/** 官方文档列出的 tick（含 World Cup 等 0.0025） */
export type PolymarketTickSize = "0.1" | "0.01" | "0.001" | "0.0001" | "0.0025";

export const POLYMARKET_AUTO_EXIT_PRICE_MIN = 0.99;
export const POLYMARKET_AUTO_EXIT_PRICE_MAX = 0.995;

const TICK_EPS = 1e-12;

function tickDecimals(step: number): number {
  const frac = String(step).split(".")[1];
  return Math.min(8, Math.max(0, frac?.length ?? 0));
}

function roundTick(n: number, step: number): number {
  return Number(n.toFixed(tickDecimals(step)));
}

export function normalizePolymarketTickSize(value: string | number | undefined): PolymarketTickSize {
  const tick = String(value ?? "").trim();
  if (
    tick === "0.1"
    || tick === "0.01"
    || tick === "0.001"
    || tick === "0.0001"
    || tick === "0.0025"
  ) {
    return tick;
  }
  throw new Error(`Polymarket 返回了不支持的 tick_size: ${tick || "空"}`);
}

export function polymarketTickStep(tick: string | number): number {
  const n = Number(tick);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`无效 tick: ${tick}`);
  return n;
}

/** 价格是否为 tick 整数倍（官方拒单条件的反面） */
export function isPolymarketPriceOnTick(price: number, tick: string | number): boolean {
  if (!Number.isFinite(price) || price <= 0 || price >= 1)
    return false;
  const step = polymarketTickStep(tick);
  const ratio = price / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
}

/**
 * 将价格对齐到 tick。
 * - mode `floor`：向下（卖出限价常用）
 * - mode `ceil`：向上
 * - mode `round`：四舍五入到最近 tick
 */
export function alignPolymarketPriceToTick(
  price: number,
  tick: string | number,
  mode: "floor" | "ceil" | "round" = "floor",
): number {
  const step = polymarketTickStep(tick);
  if (!Number.isFinite(price))
    throw new Error(`无效价格: ${price}`);
  const scaled = price / step;
  let n: number;
  if (mode === "ceil")
    n = Math.ceil(scaled - TICK_EPS);
  else if (mode === "round")
    n = Math.round(scaled);
  else
    n = Math.floor(scaled + TICK_EPS);
  return roundTick(n * step, step);
}

/**
 * [min, max] 内所有合法挂单价（含端点，若端点本身在 tick 上）。
 * tick=0.01 → 通常只有 0.99；tick=0.001 → 0.990…0.995。
 */
export function listPolymarketTickPricesInRange(
  tick: string | number,
  minPrice = POLYMARKET_AUTO_EXIT_PRICE_MIN,
  maxPrice = POLYMARKET_AUTO_EXIT_PRICE_MAX,
): number[] {
  const step = polymarketTickStep(tick);
  if (!(minPrice <= maxPrice))
    return [];

  let p = isPolymarketPriceOnTick(minPrice, step)
    ? roundTick(minPrice, step)
    : alignPolymarketPriceToTick(minPrice, step, "ceil");

  const out: number[] = [];
  while (p <= maxPrice + TICK_EPS) {
    if (p > 0 && p < 1 && p + TICK_EPS >= minPrice)
      out.push(p);
    p = roundTick(p + step, step);
  }
  return out;
}

/**
 * 自动止盈挂单价：在 [min,max] 的合法 tick 价中均匀随机；
 * 若区间内无合法价，降级为 ≤max 的最大合法 tick 价（常见 tick=0.01 → 0.99）。
 */
export function pickPolymarketAutoExitSellPrice(
  tick: string | number,
  opts?: {
    minPrice?: number;
    maxPrice?: number;
    random?: () => number;
  },
): number {
  const minPrice = opts?.minPrice ?? POLYMARKET_AUTO_EXIT_PRICE_MIN;
  const maxPrice = opts?.maxPrice ?? POLYMARKET_AUTO_EXIT_PRICE_MAX;
  const random = opts?.random ?? Math.random;

  const candidates = listPolymarketTickPricesInRange(tick, minPrice, maxPrice);
  if (candidates.length > 0) {
    const idx = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    return candidates[idx]!;
  }

  const step = polymarketTickStep(tick);
  const fallback = alignPolymarketPriceToTick(maxPrice, step, "floor");
  if (fallback <= 0 || fallback >= 1)
    throw new Error(`无法为 tick=${tick} 在 [${minPrice},${maxPrice}] 选出合法卖价`);
  return fallback;
}
