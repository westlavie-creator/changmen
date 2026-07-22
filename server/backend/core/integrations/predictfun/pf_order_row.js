/**
 * PredictFun RDS 订单行字段读取（纯函数，无 IO）
 */

import { roundUsdt } from "./pf_ledger.js";
import { readPfLedgerState } from "./pf_lifecycle.js";

export function rdsOrderKey(row) {
  return String(row?.orderId ?? row?.OrderID ?? "").trim();
}

export function rdsOrderStatus(row) {
  return row?.status ?? row?.Status ?? "None";
}

export function rdsBetMoney(row) {
  return roundUsdt(row?.betMoney ?? row?.BetMoney);
}

export function rdsPfHash(row) {
  return String(row?.pfOrderHash ?? rdsOrderKey(row)).trim();
}

export function rdsPfApiOrderId(row) {
  return String(row?.pfApiOrderId ?? "").trim();
}

/** 仅认已入账退款；reject + pending_credit 必须可重试 */
export function rdsAlreadyRefunded(row) {
  if (row?.pfRefundedAt != null)
    return true;
  if (readPfLedgerState(row) === "credited") {
    const st = String(rdsOrderStatus(row)).toLowerCase();
    if (st === "reject" || st === "return")
      return true;
  }
  return false;
}

export function rdsToMapInput(rdsRow) {
  return {
    orderId: rdsOrderKey(rdsRow),
    odds: rdsRow?.odds ?? rdsRow?.Odds,
    betMoney: rdsBetMoney(rdsRow),
    money: rdsRow?.money ?? rdsRow?.Money,
    createAt: rdsRow?.createAt ?? rdsRow?.CreateAt,
    match: rdsRow?.match ?? rdsRow?.Match,
    bet: rdsRow?.bet ?? rdsRow?.Bet,
    item: rdsRow?.item ?? rdsRow?.Item,
    link: rdsRow?.link ?? rdsRow?.Link,
    pfMarketId: rdsRow?.pfMarketId,
    pfTokenId: rdsRow?.pfTokenId,
    status: rdsOrderStatus(rdsRow),
    pfSellState: rdsRow?.pfSellState ?? rdsRow?.PfSellState,
    pfSide: rdsRow?.pfSide ?? rdsRow?.PfSide,
    pfBuyOrderId: rdsRow?.pfBuyOrderId ?? rdsRow?.PfBuyOrderId,
    pfShares: rdsRow?.pfShares ?? rdsRow?.PfShares,
    pfHoldShares: rdsRow?.pfHoldShares ?? rdsRow?.PfHoldShares,
    pfNotionalUsdt: rdsRow?.pfNotionalUsdt ?? rdsRow?.PfNotionalUsdt,
    pfFillCostUsdt: rdsRow?.pfFillCostUsdt ?? rdsRow?.PfFillCostUsdt,
    pfBookPrice: rdsRow?.pfBookPrice ?? rdsRow?.PfBookPrice,
    pfFeeAmountWei: rdsRow?.pfFeeAmountWei ?? rdsRow?.PfFeeAmountWei,
    pfFeeType: rdsRow?.pfFeeType ?? rdsRow?.PfFeeType,
    pfFeeUsdt: rdsRow?.pfFeeUsdt ?? rdsRow?.PfFeeUsdt,
    pfFeeRateBps: rdsRow?.pfFeeRateBps ?? rdsRow?.PfFeeRateBps,
  };
}

/** @param {object[]} list @param {string} orderId */
export function findPfOrderInList(list, orderId) {
  const want = String(orderId ?? "").trim();
  if (!want)
    return null;
  return (list || []).find((row) => {
    const id = rdsOrderKey(row);
    const hash = rdsPfHash(row);
    const apiId = rdsPfApiOrderId(row);
    return id === want || hash === want || (apiId && apiId === want);
  }) ?? null;
}
