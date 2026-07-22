/**
 * 官方 / wallet 手续费提取 → RDS raw 字段
 * 持仓份额 pfHoldShares 在 VPS 写库时一并落库（浏览器只读）
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
 * 官网持仓口径：成交份额 − SHARES 手续费（COLLATERAL 不扣份）
 * @param {{ pfShares?: number|string|null, pfFeeAmountWei?: string|null, pfFeeType?: string|null, pfSide?: string|null }} input
 * @returns {number|undefined}
 */
export function computePfHoldShares(input) {
  if (String(input?.pfSide ?? "").toLowerCase() === "sell")
    return undefined;
  const shares = Number(input?.pfShares);
  if (!Number.isFinite(shares) || !(shares > 0))
    return undefined;
  const type = String(input?.pfFeeType ?? "").toUpperCase();
  const wei = String(input?.pfFeeAmountWei ?? "").trim();
  if (type === "SHARES" && /^\d+$/.test(wei)) {
    try {
      const fee = Number(BigInt(wei)) / 1e18;
      if (Number.isFinite(fee) && fee > 0) {
        const net = shares - fee;
        if (Number.isFinite(net) && net > 0)
          return net;
      }
    }
    catch {
      /* ignore */
    }
  }
  return shares;
}

/**
 * 写库补丁：优先官方/wallet；否则保留 RDS 已有手续费；并落 pfHoldShares
 * @param {object|null|undefined} official
 * @param {object|null|undefined} rdsRow
 * @param {{ pfShares?: number|string|null }} [opts] 本次成交份额（优先于 rds）
 */
export function resolvePfFeeSavePatch(official, rdsRow, opts = {}) {
  const fromOfficial = extractPfFeeFromOfficial(official);
  /** @type {Record<string, unknown>} */
  let feePart = {};
  if (fromOfficial.amountWei) {
    feePart = {
      pfFeeAmountWei: fromOfficial.amountWei,
      pfFeeType: fromOfficial.type,
      ...(fromOfficial.usdt != null ? { pfFeeUsdt: fromOfficial.usdt } : {}),
    };
  }
  else {
    const prevWei = String(rdsRow?.pfFeeAmountWei ?? rdsRow?.PfFeeAmountWei ?? "").trim();
    if (prevWei) {
      const type = String(rdsRow?.pfFeeType ?? rdsRow?.PfFeeType ?? "").toUpperCase() === "SHARES"
        ? "SHARES"
        : "COLLATERAL";
      const usdt = rdsRow?.pfFeeUsdt != null || rdsRow?.PfFeeUsdt != null
        ? Number(rdsRow?.pfFeeUsdt ?? rdsRow?.PfFeeUsdt)
        : pfFeeAmountWeiToUsdt(prevWei, type);
      feePart = {
        pfFeeAmountWei: prevWei,
        pfFeeType: type,
        ...(Number.isFinite(usdt) ? { pfFeeUsdt: usdt } : {}),
      };
    }
  }

  const shares = opts.pfShares != null
    ? Number(opts.pfShares)
    : Number(rdsRow?.pfShares ?? rdsRow?.PfShares);
  const hold = computePfHoldShares({
    pfShares: Number.isFinite(shares) && shares > 0 ? shares : undefined,
    pfFeeAmountWei: feePart.pfFeeAmountWei != null
      ? String(feePart.pfFeeAmountWei)
      : (rdsRow?.pfFeeAmountWei ?? rdsRow?.PfFeeAmountWei),
    pfFeeType: feePart.pfFeeType != null
      ? String(feePart.pfFeeType)
      : (rdsRow?.pfFeeType ?? rdsRow?.PfFeeType),
    pfSide: rdsRow?.pfSide ?? rdsRow?.PfSide,
  });

  return {
    ...feePart,
    ...(hold != null ? { pfHoldShares: hold } : {}),
  };
}
