/**
 * 官方 / wallet 手续费提取 → RDS raw 字段
 */

import { pfFeeAmountWeiToUsdt } from "./pf_wallet_events_parse.js";

/**
 * @param {object|null|undefined} official
 * @returns {{ amountWei?: string, type?: "COLLATERAL"|"SHARES", usdt?: number }}
 */
export function extractPfFeeFromOfficial(official) {
  const fee = official?.pfWalletFee
    ?? official?.fee
    ?? null;
  if (!fee || typeof fee !== "object")
    return {};
  const amountWei = String(fee.amountWei ?? fee.amount ?? "").trim();
  if (!amountWei || !/^\d+$/.test(amountWei))
    return {};
  const type = String(fee.type ?? "").toUpperCase() === "SHARES" ? "SHARES" : "COLLATERAL";
  const usdt = pfFeeAmountWeiToUsdt(amountWei, type);
  return {
    amountWei,
    type,
    ...(usdt != null ? { usdt } : {}),
  };
}

/**
 * 写库补丁：优先官方/wallet；否则保留 RDS 已有手续费
 * @param {object|null|undefined} official
 * @param {object|null|undefined} rdsRow
 */
export function resolvePfFeeSavePatch(official, rdsRow) {
  const fromOfficial = extractPfFeeFromOfficial(official);
  if (fromOfficial.amountWei) {
    return {
      pfFeeAmountWei: fromOfficial.amountWei,
      pfFeeType: fromOfficial.type,
      ...(fromOfficial.usdt != null ? { pfFeeUsdt: fromOfficial.usdt } : {}),
    };
  }
  const prevWei = String(rdsRow?.pfFeeAmountWei ?? "").trim();
  if (prevWei) {
    const type = String(rdsRow?.pfFeeType ?? "").toUpperCase() === "SHARES"
      ? "SHARES"
      : "COLLATERAL";
    const usdt = rdsRow?.pfFeeUsdt != null
      ? Number(rdsRow.pfFeeUsdt)
      : pfFeeAmountWeiToUsdt(prevWei, type);
    return {
      pfFeeAmountWei: prevWei,
      pfFeeType: type,
      ...(Number.isFinite(usdt) ? { pfFeeUsdt: usdt } : {}),
    };
  }
  return {};
}
