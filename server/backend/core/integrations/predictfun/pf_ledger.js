/**
 * PredictFun house 会员余额（[changmen 扩展]）
 *
 * 真相源：`players.total_balance`（对用户叫「余额」）。
 * 不使用 A8 `credit` 授信字段。
 *
 * - 管理员设定 / 充值 → 直接写 total_balance
 * - 下单成功 → total_balance -= bet_money，并记订单
 * - 中途卖出 → total_balance += proceeds；买单 money=盈亏
 * - 到期结算 → Win 加回 payout / Lose 不动本金（已扣）
 * - 订单用于战绩与未结笔数；余额以 total_balance 为准，不靠 credit 反推
 */

function orderStatus(row) {
  return String(row?.status ?? row?.Status ?? "None").trim() || "None";
}

function orderMoney(row) {
  return Number(row?.money ?? row?.Money) || 0;
}

function orderBetMoney(row) {
  return Number(row?.bet_money ?? row?.betMoney ?? row?.BetMoney) || 0;
}

function orderPfSellState(row) {
  return String(
    row?.pfSellState
      ?? row?.PfSellState
      ?? (row?.raw && typeof row.raw === "object" ? row.raw.pfSellState : "")
      ?? "",
  ).toLowerCase();
}

function orderPfSide(row) {
  return String(
    row?.pfSide
      ?? row?.PfSide
      ?? (row?.raw && typeof row.raw === "object" ? row.raw.pfSide : "")
      ?? "",
  ).toLowerCase();
}

function isOpenStatus(status, row) {
  const s = String(status || "").toLowerCase();
  if (s !== "none" && s !== "pending")
    return false;
  // 卖单行本身不算未结敞口
  if (orderPfSide(row) === "sell")
    return false;
  // 已 1:1 卖出 / 赛果结算的买单不再计入未结
  if (orderPfSellState(row) === "closed" || orderPfSellState(row) === "settled")
    return false;
  return true;
}

function isVoidStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "reject" || s === "return";
}

/**
 * 订单汇总（战绩 / 未结），不参与余额公式
 * @returns {{ settledPnl: number, openStake: number, orderCount: number, unsettle: number }}
 */
export function summarizePfOrders(orders) {
  const list = Array.isArray(orders) ? orders : [];
  let settledPnl = 0;
  let openStake = 0;
  let unsettle = 0;

  for (const row of list) {
    const status = orderStatus(row);
    const money = orderMoney(row);
    const bet = orderBetMoney(row);

    if (isVoidStatus(status))
      continue;
    if (orderPfSide(row) === "sell")
      continue;
    if (isOpenStatus(status, row)) {
      openStake += bet;
      unsettle += 1;
      continue;
    }
    settledPnl += money;
  }

  return {
    settledPnl: Math.round(settledPnl * 100) / 100,
    openStake: Math.round(openStake * 100) / 100,
    orderCount: list.length,
    unsettle,
  };
}

export function roundUsdt(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 下单扣减后余额 */
export function balanceAfterStake(balance, stake) {
  return roundUsdt((Number(balance) || 0) - (Number(stake) || 0));
}

/**
 * 下单预检：当前余额是否盖过本金
 * @param {number} balance players.total_balance
 */
/**
 * @param {number} balance
 * @param {number} stakeUsdt 须盖过的金额（apiBetMoney 或名义 makerUsdt）
 * @param {{ label?: string }} [opts]
 */
export function assertPfAvailableBalance(balance, stakeUsdt, opts = {}) {
  const stake = Number(stakeUsdt);
  if (!Number.isFinite(stake) || stake <= 0)
    return { ok: false, msg: "apiBetMoney 无效" };
  const bal = roundUsdt(balance);
  if (stake > bal + 1e-9) {
    const label = String(opts.label || "").trim() || "所需";
    return {
      ok: false,
      msg: `可用余额不足（${bal} < ${label} ${stake} USDT）`,
      balance: bal,
    };
  }
  return { ok: true, balance: bal };
}
