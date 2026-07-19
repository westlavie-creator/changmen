/** 赔率统一保留 3 位小数（与 TJ01 / A8 展示一致） */
export function formatOdds(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n))
    return 0;
  if (n === 0)
    return 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * 预测市（Polymarket / PredictFun）：`1/price` 十进制赔率截断到 3 位（不四舍五入）。
 * 展示、Sources 落库、fo.odds 与此同源；限价仍用原始 clobPrice(0~1)。
 */
export function truncateOddsTo3(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    return 0;
  return Math.trunc(n * 1000) / 1000;
}

/** @deprecated 别名：与 truncateOddsTo3 相同，强调 PM/PF 共用 */
export const formatPredictionMarketOdds = truncateOddsTo3;

export function formatBetOdds(bet: Record<string, unknown>): Record<string, unknown> {
  if (!bet || typeof bet !== "object")
    return bet;
  return {
    ...bet,
    HomeOdds: formatOdds(bet.HomeOdds as number),
    AwayOdds: formatOdds(bet.AwayOdds as number),
  };
}

/** Polymarket / PredictFun SaveBet：截断三位，对齐盘口展示 */
export function formatPredictionMarketBetOdds(bet: Record<string, unknown>): Record<string, unknown> {
  if (!bet || typeof bet !== "object")
    return bet;
  return {
    ...bet,
    HomeOdds: truncateOddsTo3(bet.HomeOdds as number),
    AwayOdds: truncateOddsTo3(bet.AwayOdds as number),
  };
}
