/**
 * 盈亏/流水聚合的 CNY 口径（对齐前端 `polymarketMoneyForAggregate`）。
 * PF 库内 money/bet_money 为 USDT，需 × 汇率；PM/PF 卖单盈亏记在买单。
 */
import { Currency, getExchange } from "@changmen/shared/currency";
import { isPredictionSellForCount } from "./kinds.js";

export function moneyForProfitAggregate(o) {
  if (isPredictionSellForCount(o))
    return 0;
  const money = Number(o?.money) || 0;
  if (String(o?.provider || "").trim() === "PredictFun")
    return money * getExchange(Currency.USDT);
  return money;
}

export function betMoneyForProfitAggregate(o) {
  const bet = Number(o?.bet_money) || 0;
  if (String(o?.provider || "").trim() === "PredictFun")
    return bet * getExchange(Currency.USDT);
  return bet;
}
