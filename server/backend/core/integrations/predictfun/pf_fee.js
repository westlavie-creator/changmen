/**
 * 官方 / wallet 手续费提取 → RDS raw 字段
 * 持仓份额 = 官网成交 wei − SHARES 手续费 wei（BigInt，与链上一致）
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

/** 小数份额 → wei（字符串路径，避免 float×1e18 误差） */
export function decimalSharesToWei(amount) {
  const raw = String(amount ?? "").trim();
  if (!raw)
    throw new Error(`无效份额 ${amount}`);
  const m = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m)
    throw new Error(`无效份额 ${amount}`);
  const whole = m[1];
  const frac = (m[2] || "").slice(0, 18).padEnd(18, "0");
  return BigInt(whole) * 10n ** 18n + BigInt(frac);
}

/** wei → 十进制 Number（先格式化为十进制串，再 Number；普通单量精确） */
export function weiToSharesDecimal(wei) {
  let w;
  try {
    w = BigInt(String(wei ?? "0"));
  }
  catch {
    return 0;
  }
  const neg = w < 0n;
  const a = neg ? -w : w;
  const whole = a / 10n ** 18n;
  const frac = a % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  const s = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return Number(neg ? `-${s}` : s);
}

/**
 * 官网持仓 wei：成交份额 wei − SHARES 手续费 wei。
 * @returns {bigint|undefined}
 */
export function computePfHoldSharesWei(input) {
  if (String(input?.pfSide ?? "").toLowerCase() === "sell")
    return undefined;

  let fillWei = 0n;
  const sharesWeiRaw = String(input?.pfSharesWei ?? "").trim();
  if (/^\d+$/.test(sharesWeiRaw)) {
    try {
      fillWei = BigInt(sharesWeiRaw);
    }
    catch {
      fillWei = 0n;
    }
  }
  if (fillWei <= 0n) {
    const shares = Number(input?.pfShares);
    if (Number.isFinite(shares) && shares > 0) {
      try {
        fillWei = decimalSharesToWei(shares);
      }
      catch {
        fillWei = 0n;
      }
    }
  }
  if (fillWei <= 0n)
    return undefined;

  const type = String(input?.pfFeeType ?? "").toUpperCase();
  const wei = String(input?.pfFeeAmountWei ?? "").trim();
  if (type === "SHARES" && /^\d+$/.test(wei)) {
    try {
      const fee = BigInt(wei);
      if (fee > 0n) {
        if (fee >= fillWei)
          return undefined;
        return fillWei - fee;
      }
    }
    catch {
      /* ignore */
    }
  }
  return fillWei;
}

/**
 * 官网持仓口径：成交份额 − SHARES 手续费（COLLATERAL 不扣份）
 * @param {{ pfShares?: number|string|null, pfSharesWei?: string|null, pfFeeAmountWei?: string|null, pfFeeType?: string|null, pfSide?: string|null }} input
 * @returns {number|undefined}
 */
export function computePfHoldShares(input) {
  const holdWei = computePfHoldSharesWei(input);
  if (holdWei == null)
    return undefined;
  const net = weiToSharesDecimal(holdWei);
  return Number.isFinite(net) && net > 0 ? net : undefined;
}

/**
 * 卖出回款净额：官方成交毛额 − COLLATERAL 手续费 USDT。
 * SHARES 手续费不从 USDT 回款扣（份额侧另计）。
 * @param {number} grossUsdt
 * @param {{ pfFeeType?: string, pfFeeUsdt?: number, pfFeeAmountWei?: string, type?: string, usdt?: number, amountWei?: string }|null|undefined} feePart
 * @returns {number}
 */
export function netSellProceedsAfterCollateralFee(grossUsdt, feePart) {
  const gross = Number(grossUsdt);
  if (!Number.isFinite(gross) || gross < 0)
    return 0;
  const type = String(feePart?.pfFeeType ?? feePart?.type ?? "").toUpperCase();
  if (type !== "COLLATERAL")
    return gross;
  let fee = Number(feePart?.pfFeeUsdt ?? feePart?.usdt);
  if (!(Number.isFinite(fee) && fee > 0)) {
    const wei = String(feePart?.pfFeeAmountWei ?? feePart?.amountWei ?? "").trim();
    const fromWei = pfFeeAmountWeiToUsdt(wei, "COLLATERAL");
    if (fromWei != null)
      fee = fromWei;
  }
  if (!(Number.isFinite(fee) && fee > 0))
    return gross;
  return Math.max(0, gross - fee);
}

/**
 * Changmencodefee 通用 bps 比例（结果保留 6 位小数）。
 * 买入对份额、卖出对 USDT 共用。
 * @param {number} amount
 * @param {number} feeRateBps
 * @returns {number}
 */
export function computeChangmenPfFeeAmount(amount, feeRateBps) {
  const base = Number(amount);
  const bps = Number(feeRateBps);
  if (!(Number.isFinite(base) && base > 0))
    return 0;
  if (!(Number.isFinite(bps) && bps > 0))
    return 0;
  const fee = base * (Math.min(10_000, Math.floor(bps)) / 10_000);
  if (!(Number.isFinite(fee) && fee > 0))
    return 0;
  return Math.round(fee * 1e6) / 1e6;
}

/** @deprecated 用 computeChangmenPfFeeAmount */
export function computeChangmenPfFeeUsdt(amountUsdt, feeRateBps) {
  return computeChangmenPfFeeAmount(amountUsdt, feeRateBps);
}

/**
 * 买入：官网净持仓上再扣 Changmencodefee（份额）→ 用户 RDS 持仓。
 * @param {number} officialHoldShares 官网净持仓（fill − 官网 SHARES fee；无则用成交份额）
 * @param {number} feeRateBps
 * @returns {{ holdShares: number, changmenCodeFeeShares: number, changmenCodeFeeRateBps: number }}
 */
export function applyChangmenBuyFeeToHoldShares(officialHoldShares, feeRateBps) {
  const hold = Number(officialHoldShares);
  const bps = Number.isFinite(Number(feeRateBps)) && Number(feeRateBps) > 0
    ? Math.min(10_000, Math.floor(Number(feeRateBps)))
    : 0;
  if (!(Number.isFinite(hold) && hold > 0)) {
    return { holdShares: 0, changmenCodeFeeShares: 0, changmenCodeFeeRateBps: bps };
  }
  const changmenCodeFeeShares = computeChangmenPfFeeAmount(hold, bps);
  return {
    holdShares: Math.max(0, Math.round((hold - changmenCodeFeeShares) * 1e6) / 1e6),
    changmenCodeFeeShares,
    changmenCodeFeeRateBps: bps,
  };
}

/**
 * 官网净回款后再扣 Changmencodefee（USDT）→ 用户 RDS 回款。
 * @param {number} afterOfficialUsdt
 * @param {number} feeRateBps
 * @returns {{ proceedsUsdt: number, changmenCodeFeeUsdt: number, changmenCodeFeeRateBps: number }}
 */
export function netSellProceedsAfterChangmenFee(afterOfficialUsdt, feeRateBps) {
  const base = Number(afterOfficialUsdt);
  const bps = Number.isFinite(Number(feeRateBps)) && Number(feeRateBps) > 0
    ? Math.min(10_000, Math.floor(Number(feeRateBps)))
    : 0;
  if (!(Number.isFinite(base) && base > 0)) {
    return { proceedsUsdt: 0, changmenCodeFeeUsdt: 0, changmenCodeFeeRateBps: bps };
  }
  const changmenCodeFeeUsdt = computeChangmenPfFeeAmount(base, bps);
  return {
    proceedsUsdt: Math.max(0, Math.round((base - changmenCodeFeeUsdt) * 1e6) / 1e6),
    changmenCodeFeeUsdt,
    changmenCodeFeeRateBps: bps,
  };
}

/**
 * 写库补丁：优先官方/wallet；否则保留 RDS 已有手续费；并落 pfHoldShares / pfHoldSharesWei
 * @param {object|null|undefined} official
 * @param {object|null|undefined} rdsRow
 * @param {{ pfShares?: number|string|null, pfSharesWei?: string|null }} [opts] 本次成交份额（优先于 rds）
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

  const sharesWeiOpt = opts.pfSharesWei != null
    ? String(opts.pfSharesWei).trim()
    : String(rdsRow?.pfSharesWei ?? rdsRow?.PfSharesWei ?? "").trim();
  const shares = opts.pfShares != null
    ? Number(opts.pfShares)
    : Number(rdsRow?.pfShares ?? rdsRow?.PfShares);
  const holdInput = {
    pfShares: Number.isFinite(shares) && shares > 0 ? shares : undefined,
    pfSharesWei: /^\d+$/.test(sharesWeiOpt) ? sharesWeiOpt : undefined,
    pfFeeAmountWei: feePart.pfFeeAmountWei != null
      ? String(feePart.pfFeeAmountWei)
      : (rdsRow?.pfFeeAmountWei ?? rdsRow?.PfFeeAmountWei),
    pfFeeType: feePart.pfFeeType != null
      ? String(feePart.pfFeeType)
      : (rdsRow?.pfFeeType ?? rdsRow?.PfFeeType),
    pfSide: rdsRow?.pfSide ?? rdsRow?.PfSide,
  };
  const holdWei = computePfHoldSharesWei(holdInput);
  const hold = holdWei != null ? weiToSharesDecimal(holdWei) : undefined;

  return {
    ...feePart,
    ...(holdWei != null ? { pfHoldSharesWei: String(holdWei) } : {}),
    ...(hold != null && hold > 0 ? { pfHoldShares: hold } : {}),
  };
}
