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
  const status = String(merged.status ?? merged.Status ?? "").toLowerCase();
  const isUnfilledReject = status === "reject" || status === "return";

  keepPrevStr("pfSide");
  keepPrevStr("pfSellState");
  keepPrevStr("pfBuyOrderId");
  keepPrevStr("pfTokenId");
  keepPrevStr("pfMarketId");
  keepPrevStr("pfOrderHash");
  keepPrevStr("pfApiOrderId");
  keepPrevStr("pfOfficialStatus");
  // 拒单未成交：禁止把旧意向 pfSharesWei 补回（成交份额只认官网）
  if (!isUnfilledReject)
    keepPrevStr("pfSharesWei");

  const prevMoney = parseNum(prevRaw.money ?? prevRow?.money, 0);
  const prevBet = parseNum(prevRaw.betMoney ?? prevRow?.bet_money, 0);
  const isSell = String(merged.pfSide ?? prevRaw.pfSide ?? "").toLowerCase() === "sell";
  if (isSell) {
    // 卖单 money 恒 0（盈亏在买单）；betMoney 空写仍保留回款镜像
    money = 0;
    if (Math.abs(bet_money) <= 1e-9 && Math.abs(prevBet) > 1e-9)
      bet_money = prevBet;
  }
  else {
    // 买单：money/betMoney 空写勿覆盖库内有效值（防 sync 误写 0）
    if (Math.abs(money) <= 1e-9 && Math.abs(prevMoney) > 1e-9)
      money = prevMoney;
    if (Math.abs(bet_money) <= 1e-9 && Math.abs(prevBet) > 1e-9)
      bet_money = prevBet;
  }
  merged.money = money;
  merged.betMoney = bet_money;

  return finalizeNonPolymarketSave(merged, prevRaw, money, bet_money);
}
