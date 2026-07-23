/**
 * 非 Polymarket 共用的 raw 字段保留（fee / hold / ledger）。
 * 历史行为：OB 等场馆也会走此段（多为空操作）；拆分时勿改语义。
 */
import { parseNum, resolvePfHoldSharesFromRaw } from "./dto.js";

/**
 * @param {object} merged
 * @param {object} prevRaw
 * @param {number} money
 * @param {number} bet_money
 * @returns {{ raw: object, money: number, bet_money: number }}
 */
export function finalizeNonPolymarketSave(merged, prevRaw, money, bet_money) {
  // PredictFun 等：save 常只带部分字段；勿丢掉已落库的手续费 / 费率
  if (!String(merged.pfFeeAmountWei ?? "").trim() && String(prevRaw.pfFeeAmountWei ?? "").trim()) {
    merged.pfFeeAmountWei = prevRaw.pfFeeAmountWei;
    if (prevRaw.pfFeeType === "SHARES" || prevRaw.pfFeeType === "COLLATERAL")
      merged.pfFeeType = prevRaw.pfFeeType;
    if (merged.pfFeeUsdt == null && prevRaw.pfFeeUsdt != null)
      merged.pfFeeUsdt = prevRaw.pfFeeUsdt;
  }
  if (
    !(Number.isFinite(Number(merged.pfFeeRateBps)) && Number(merged.pfFeeRateBps) >= 0)
    && Number.isFinite(Number(prevRaw.pfFeeRateBps))
    && Number(prevRaw.pfFeeRateBps) >= 0
  ) {
    merged.pfFeeRateBps = Number(prevRaw.pfFeeRateBps);
  }
  if (
    !(Number.isFinite(Number(merged.pfChangmenCodeFeeRateBps)) && Number(merged.pfChangmenCodeFeeRateBps) >= 0)
    && !(Number.isFinite(Number(merged.pfChangmenFeeRateBps)) && Number(merged.pfChangmenFeeRateBps) >= 0)
  ) {
    const prevRate = Number(prevRaw.pfChangmenCodeFeeRateBps ?? prevRaw.pfChangmenFeeRateBps);
    if (Number.isFinite(prevRate) && prevRate >= 0)
      merged.pfChangmenCodeFeeRateBps = prevRate;
  }
  else if (!(Number.isFinite(Number(merged.pfChangmenCodeFeeRateBps)) && Number(merged.pfChangmenCodeFeeRateBps) >= 0)
    && Number.isFinite(Number(merged.pfChangmenFeeRateBps))
    && Number(merged.pfChangmenFeeRateBps) >= 0) {
    merged.pfChangmenCodeFeeRateBps = Number(merged.pfChangmenFeeRateBps);
  }
  if (
    !(Number.isFinite(Number(merged.pfChangmenCodeFeeUsdt)) && Number(merged.pfChangmenCodeFeeUsdt) > 0)
    && !(Number.isFinite(Number(merged.pfChangmenFeeUsdt)) && Number(merged.pfChangmenFeeUsdt) > 0)
  ) {
    const prevUsdt = Number(prevRaw.pfChangmenCodeFeeUsdt ?? prevRaw.pfChangmenFeeUsdt);
    if (Number.isFinite(prevUsdt) && prevUsdt > 0)
      merged.pfChangmenCodeFeeUsdt = prevUsdt;
  }
  else if (!(Number.isFinite(Number(merged.pfChangmenCodeFeeUsdt)) && Number(merged.pfChangmenCodeFeeUsdt) > 0)
    && Number.isFinite(Number(merged.pfChangmenFeeUsdt))
    && Number(merged.pfChangmenFeeUsdt) > 0) {
    merged.pfChangmenCodeFeeUsdt = Number(merged.pfChangmenFeeUsdt);
  }
  if (
    !(Number.isFinite(Number(merged.pfChangmenCodeFeeShares)) && Number(merged.pfChangmenCodeFeeShares) > 0)
    && !(Number.isFinite(Number(merged.pfChangmenFeeShares)) && Number(merged.pfChangmenFeeShares) > 0)
  ) {
    const prevShares = Number(prevRaw.pfChangmenCodeFeeShares ?? prevRaw.pfChangmenFeeShares);
    if (Number.isFinite(prevShares) && prevShares > 0)
      merged.pfChangmenCodeFeeShares = prevShares;
  }
  else if (!(Number.isFinite(Number(merged.pfChangmenCodeFeeShares)) && Number(merged.pfChangmenCodeFeeShares) > 0)
    && Number.isFinite(Number(merged.pfChangmenFeeShares))
    && Number(merged.pfChangmenFeeShares) > 0) {
    merged.pfChangmenCodeFeeShares = Number(merged.pfChangmenFeeShares);
  }
  if (!String(merged.pfSellOrderId ?? "").trim() && String(prevRaw.pfSellOrderId ?? "").trim())
    merged.pfSellOrderId = prevRaw.pfSellOrderId;
  if (
    !(Number.isFinite(Number(merged.pfSellProceeds)) && Number(merged.pfSellProceeds) >= 0)
    && Number.isFinite(Number(prevRaw.pfSellProceeds))
    && Number(prevRaw.pfSellProceeds) >= 0
  ) {
    merged.pfSellProceeds = Number(prevRaw.pfSellProceeds);
  }
  if (
    !(Number.isFinite(Number(merged.pfNotionalUsdt)) && Number(merged.pfNotionalUsdt) > 0)
    && Number.isFinite(Number(prevRaw.pfNotionalUsdt))
    && Number(prevRaw.pfNotionalUsdt) > 0
  ) {
    merged.pfNotionalUsdt = Number(prevRaw.pfNotionalUsdt);
  }
  else if (!(Number.isFinite(Number(merged.pfNotionalUsdt)) && Number(merged.pfNotionalUsdt) > 0)) {
    const book = Number(merged.pfBookPrice ?? prevRaw.pfBookPrice);
    const shares = Number(merged.pfShares ?? prevRaw.pfShares);
    if (Number.isFinite(book) && book > 0 && book < 1
      && Number.isFinite(shares) && shares > 0) {
      merged.pfNotionalUsdt = Math.round(shares * book * 1e6) / 1e6;
    }
  }
  if (
    !(Number.isFinite(Number(merged.pfFillCostUsdt)) && Number(merged.pfFillCostUsdt) > 0)
    && Number.isFinite(Number(prevRaw.pfFillCostUsdt))
    && Number(prevRaw.pfFillCostUsdt) > 0
  ) {
    merged.pfFillCostUsdt = Number(prevRaw.pfFillCostUsdt);
  }
  if (
    !(Number.isFinite(Number(merged.pfBookPrice)) && Number(merged.pfBookPrice) > 0
      && Number(merged.pfBookPrice) < 1)
    && Number.isFinite(Number(prevRaw.pfBookPrice))
    && Number(prevRaw.pfBookPrice) > 0
    && Number(prevRaw.pfBookPrice) < 1
  ) {
    merged.pfBookPrice = Number(prevRaw.pfBookPrice);
  }
  if (!(Number(merged.pfShares) > 0) && Number(prevRaw.pfShares) > 0)
    merged.pfShares = Number(prevRaw.pfShares);
  const hold = resolvePfHoldSharesFromRaw(merged);
  const incomingStatus = String(merged.status ?? merged.Status ?? "").toLowerCase();
  // Pending 未 fee-ready：禁止用毛仓「发明」可卖 hold
  if (incomingStatus !== "pending") {
    if (hold != null && hold > 0)
      merged.pfHoldShares = hold;
    else if (!(Number(merged.pfHoldShares) > 0) && Number(prevRaw.pfHoldShares) > 0)
      merged.pfHoldShares = Number(prevRaw.pfHoldShares);
  }
  else if (!(Number(merged.pfHoldShares) > 0) && Number(prevRaw.pfHoldShares) > 0) {
    merged.pfHoldShares = Number(prevRaw.pfHoldShares);
  }
  if (!String(merged.pfLedgerState ?? "").trim() && String(prevRaw.pfLedgerState ?? "").trim())
    merged.pfLedgerState = prevRaw.pfLedgerState;
  // credited / 显式 0：允许清零 pending；否则保留库内正数
  if (String(merged.pfLedgerState ?? "").toLowerCase() === "credited" || merged.pfPendingCreditUsdt === 0) {
    if (merged.pfPendingCreditUsdt == null)
      merged.pfPendingCreditUsdt = 0;
  }
  else if (
    !(Number.isFinite(Number(merged.pfPendingCreditUsdt)) && Number(merged.pfPendingCreditUsdt) > 0)
    && Number.isFinite(Number(prevRaw.pfPendingCreditUsdt))
    && Number(prevRaw.pfPendingCreditUsdt) > 0
  ) {
    merged.pfPendingCreditUsdt = Number(prevRaw.pfPendingCreditUsdt);
  }
  return { raw: merged, money, bet_money };
}

/** 场馆等非 PM/非 PF：仅共用 raw 保留（历史行为，与旧非 PM 支尾段一致） */
export function mergeOtherProviderLogicalSave(merged, prevRaw, money, bet_money) {
  return finalizeNonPolymarketSave(merged, prevRaw, money, bet_money);
}
