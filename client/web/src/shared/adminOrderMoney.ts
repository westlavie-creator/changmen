import { Currency, getExchange } from "@changmen/shared/currency";

type AdminMoneyRow = {
  provider?: string | null;
  money?: number | null;
  pfSide?: string | null;
  pmSide?: string | null;
};

type AdminBetRow = {
  provider?: string | null;
  betMoney?: number | null;
  pfSide?: string | null;
  pmSide?: string | null;
};

/** PM/PF 影子卖单行（盈亏不在此行；betMoney 为回款镜像） */
export function isAdminPredictionSell(row: {
  provider?: string | null;
  pmSide?: string | null;
  pfSide?: string | null;
}): boolean {
  const provider = String(row.provider || "").trim();
  if (provider === "Polymarket" && String(row.pmSide || "").toLowerCase() === "sell")
    return true;
  if (provider === "PredictFun" && String(row.pfSide || "").toLowerCase() === "sell")
    return true;
  return false;
}

/**
 * 管理端订单盈亏 → CNY（对齐战绩 / polymarketMoneyForAggregate）。
 * PF 库内 money 为 USDT；PM/PF 卖单盈亏记在买单。
 */
export function adminOrderMoneyCny(row: AdminMoneyRow): number {
  if (isAdminPredictionSell(row))
    return 0;
  const money = Number(row.money) || 0;
  if (String(row.provider || "").trim() === "PredictFun")
    return money * getExchange(Currency.USDT);
  return money;
}

/**
 * 管理端金额列：买入本金或卖出回款镜像 → CNY。
 * PF betMoney 为 USDT；卖单数值是回款，勿当买入本金汇总。
 */
export function adminOrderBetMoneyCny(row: AdminBetRow): number {
  const bet = Number(row.betMoney) || 0;
  if (String(row.provider || "").trim() === "PredictFun")
    return bet * getExchange(Currency.USDT);
  return bet;
}

/**
 * Link/组「买入合计」：跳过 PM/PF 影子卖单（其 betMoney 是回款镜像）。
 */
export function adminOrderBuyStakeCny(row: AdminBetRow): number {
  if (isAdminPredictionSell(row))
    return 0;
  return adminOrderBetMoneyCny(row);
}

export function sumAdminOrdersMoneyCny(rows: Iterable<AdminMoneyRow>): number {
  let sum = 0;
  for (const r of rows)
    sum += adminOrderMoneyCny(r);
  return sum;
}
