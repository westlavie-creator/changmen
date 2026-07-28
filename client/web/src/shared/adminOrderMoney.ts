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
};

/**
 * 管理端订单盈亏 → CNY（对齐战绩 / polymarketMoneyForAggregate）。
 * PF 库内 money 为 USDT；PM/PF 卖单盈亏记在买单。
 */
export function adminOrderMoneyCny(row: AdminMoneyRow): number {
  const provider = String(row.provider || "").trim();
  if (provider === "Polymarket" && String(row.pmSide || "").toLowerCase() === "sell")
    return 0;
  if (provider === "PredictFun" && String(row.pfSide || "").toLowerCase() === "sell")
    return 0;
  const money = Number(row.money) || 0;
  if (provider === "PredictFun")
    return money * getExchange(Currency.USDT);
  return money;
}

/** PF betMoney 为 USDT → CNY（含卖单回款镜像） */
export function adminOrderBetMoneyCny(row: AdminBetRow): number {
  const bet = Number(row.betMoney) || 0;
  if (String(row.provider || "").trim() === "PredictFun")
    return bet * getExchange(Currency.USDT);
  return bet;
}

export function sumAdminOrdersMoneyCny(rows: Iterable<AdminMoneyRow>): number {
  let sum = 0;
  for (const r of rows)
    sum += adminOrderMoneyCny(r);
  return sum;
}
