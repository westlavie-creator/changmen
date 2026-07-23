/**
 * PredictFun save 合并：身份/金额保护 + 非 PM 共用 raw 保留。
 * 与 Polymarket / 场馆平行，由 mergeOrderLogicalSave 分发。
 */
import { parseNum } from "./dto.js";
import { finalizeNonPolymarketSave } from "./save_non_pm.js";

/**
 * @param {object|undefined} prevRow
 * @param {object} prevRaw
 * @param {object} merged
 * @param {number} money
 * @param {number} bet_money
 */
export function mergePredictFunLogicalSave(prevRow, prevRaw, merged, money, bet_money) {
  // PredictFun：部分 sync 漏传时保留身份/生命周期；勿让场馆单误继承 pf* 脏字段
  const keepPrevStr = (key) => {
    if (!String(merged[key] ?? "").trim() && String(prevRaw[key] ?? "").trim())
      merged[key] = prevRaw[key];
  };
  keepPrevStr("pfSide");
  keepPrevStr("pfSellState");
  keepPrevStr("pfBuyOrderId");
  keepPrevStr("pfTokenId");
  keepPrevStr("pfMarketId");
  keepPrevStr("pfOrderHash");
  keepPrevStr("pfApiOrderId");
  keepPrevStr("pfOfficialStatus");
  keepPrevStr("pfSharesWei");

  // money/betMoney 空写勿覆盖库内有效值（对标 PM sell/closed 保护）
  const prevMoney = parseNum(prevRaw.money ?? prevRow?.money, 0);
  const prevBet = parseNum(prevRaw.betMoney ?? prevRow?.bet_money, 0);
  if (Math.abs(money) <= 1e-9 && Math.abs(prevMoney) > 1e-9)
    money = prevMoney;
  if (Math.abs(bet_money) <= 1e-9 && Math.abs(prevBet) > 1e-9)
    bet_money = prevBet;
  merged.money = money;
  merged.betMoney = bet_money;

  return finalizeNonPolymarketSave(merged, prevRaw, money, bet_money);
}
