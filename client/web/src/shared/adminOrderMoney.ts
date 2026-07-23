import type { AdminOrderRow } from "@/types/admin";
import { Currency, getExchange } from "@changmen/shared/currency";

/**
 * 管理端订单盈亏 → CNY（对齐战绩 / polymarketMoneyForAggregate）。
 * PF 库内 money 为 USDT；卖单盈亏记在买单。
 */
export function adminOrderMoneyCny(row: Pick<AdminOrderRow, "provider" | "money" | "pfSide">): number {
  const money = Number(row.money) || 0;
  if (String(row.provider || "").trim() !== "PredictFun")
    return money;
  if (String(row.pfSide || "").toLowerCase() === "sell")
    return 0;
  return money * getExchange(Currency.USDT);
}

/** PF betMoney 为 USDT → CNY（含卖单回款镜像） */
export function adminOrderBetMoneyCny(row: Pick<AdminOrderRow, "provider" | "betMoney">): number {
  const bet = Number(row.betMoney) || 0;
  if (String(row.provider || "").trim() === "PredictFun")
    return bet * getExchange(Currency.USDT);
  return bet;
}

export function sumAdminOrdersMoneyCny(rows: Iterable<Pick<AdminOrderRow, "provider" | "money" | "pfSide">>): number {
  let sum = 0;
  for (const r of rows)
    sum += adminOrderMoneyCny(r);
  return sum;
}
