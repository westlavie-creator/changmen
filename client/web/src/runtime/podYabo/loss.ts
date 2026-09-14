/** 当日已结算亏损 + 未结算注码触及上限则停自动。0 = 不设。 */
export function podYaboDailyLossBlocked(opts: {
  todayProfit: number;
  openStake: number;
  maxDailyLoss: number;
}): boolean {
  const cap = Number(opts.maxDailyLoss) || 0;
  if (!(cap > 0))
    return false;
  const settledLoss = Math.max(0, -(Number(opts.todayProfit) || 0));
  const open = Math.max(0, Number(opts.openStake) || 0);
  return settledLoss + open >= cap;
}
