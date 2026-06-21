/** 赔率统一保留 3 位小数（与 TJ01 / A8 展示一致） */
export function formatOdds(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n))
    return 0;
  if (n === 0)
    return 0;
  return Math.round(n * 1000) / 1000;
}

export function formatBetOdds(bet: Record<string, unknown>): Record<string, unknown> {
  if (!bet || typeof bet !== "object")
    return bet;
  return {
    ...bet,
    HomeOdds: formatOdds(bet.HomeOdds as number),
    AwayOdds: formatOdds(bet.AwayOdds as number),
  };
}
