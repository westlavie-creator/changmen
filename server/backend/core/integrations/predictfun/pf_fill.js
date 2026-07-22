/**
 * 官方 OrderData → 成交份额 / 回款校正
 * @see https://dev.predict.fun/get-order-by-hash-25326901e0
 *
 * - order.makerAmount / takerAmount：wei bigint 字符串（SDK）
 * - amount / amountFilled：官方未严格标注；含小数按人类单位，纯整数按 wei
 */

import { roundUsdt } from "./pf_ledger.js";

function weiToDecimal18(wei) {
  try {
    return Number(BigInt(String(wei ?? "0"))) / 1e18;
  }
  catch {
    return 0;
  }
}
/**
 * @param {unknown} raw
 * @returns {bigint}
 */
export function parsePredictQuantityToWei(raw) {
  const s = String(raw ?? "").trim();
  if (!s)
    return 0n;
  if (s.includes(".")) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0)
      return 0n;
    return BigInt(Math.round(n * 1e18));
  }
  if (!/^\d+$/.test(s))
    return 0n;
  try {
    return BigInt(s);
  }
  catch {
    return 0n;
  }
}

function orderSide(official) {
  const side = official?.order?.side;
  if (side === 1 || side === "1" || String(side).toUpperCase() === "SELL")
    return "sell";
  return "buy";
}

/**
 * BUY FILLED：份额优先 amountFilled → order.takerAmount → fallback
 * @param {object|null|undefined} official
 * @param {string|bigint|number|null|undefined} fallbackWei
 * @returns {{ sharesWei: bigint, shares: number, amountFilledRaw?: string }}
 */
export function extractBuyFillShares(official, fallbackWei) {
  const fromFilled = parsePredictQuantityToWei(official?.amountFilled);
  const fromTaker = parsePredictQuantityToWei(official?.order?.takerAmount);
  let sharesWei = 0n;
  if (fromFilled > 0n)
    sharesWei = fromFilled;
  else if (fromTaker > 0n)
    sharesWei = fromTaker;
  else {
    try {
      sharesWei = BigInt(String(fallbackWei ?? "0"));
    }
    catch {
      sharesWei = 0n;
    }
  }
  return {
    sharesWei,
    shares: weiToDecimal18(sharesWei),
    amountFilledRaw: official?.amountFilled != null ? String(official.amountFilled) : undefined,
  };
}

/**
 * 是否已有可解析的 BUY 实付信号（人类 amount 或 wallet executedValue）
 * @param {object|null|undefined} official
 */
export function hasBuyFillCostSignal(official) {
  const amountStr = String(official?.amount ?? "").trim();
  if (amountStr.includes(".")) {
    const n = Number(amountStr);
    if (Number.isFinite(n) && n > 0)
      return true;
  }
  const execRaw = official?.pfExecutedValueWei
    ?? official?.executedValueWei
    ?? (official?.fill && typeof official.fill === "object"
      ? /** @type {Record<string, unknown>} */ (official.fill).executedValueWei
      : undefined);
  return parsePredictQuantityToWei(execRaw) > 0n;
}

/**
 * BUY FILLED：实际付出 USDT（交易本金，不含 SHARES 手续费）
 * 优先 amount（人类）→ wallet executedValueWei → BUY makerAmount；
 * wallet stub 为 SELL 形（maker=份额、taker=USDT）时只用 taker；
 * stub 缺 value 时勿把份额 maker 当 U，退回 fallbackUsdt。
 * @param {object|null|undefined} official
 * @param {number} [fallbackUsdt]
 * @param {{ excludeMakerAmount?: boolean }} [opts] excludeMakerAmount：实付与名义分离时勿用 makerAmount
 * @returns {number}
 */
export function extractBuyFillCostUsdt(official, fallbackUsdt = 0, opts = {}) {
  let cost = 0;
  const amountStr = String(official?.amount ?? "").trim();
  if (amountStr.includes(".")) {
    const n = Number(amountStr);
    if (Number.isFinite(n) && n > 0)
      cost = n;
  }
  if (cost <= 0) {
    const execRaw = official?.pfExecutedValueWei
      ?? official?.executedValueWei
      ?? (official?.fill && typeof official.fill === "object"
        ? /** @type {Record<string, unknown>} */ (official.fill).executedValueWei
        : undefined);
    const execWei = parsePredictQuantityToWei(execRaw);
    if (execWei > 0n)
      cost = weiToDecimal18(execWei);
  }
  if (cost <= 0 && !opts.excludeMakerAmount) {
    const makerWei = parsePredictQuantityToWei(official?.order?.makerAmount);
    const takerWei = parsePredictQuantityToWei(official?.order?.takerAmount);
    const filledWei = parsePredictQuantityToWei(official?.amountFilled);
    const side = orderSide(official);
    // wallet stub：amountFilled === makerAmount（均为 size），maker 不是 USDT
    const stubShaped = filledWei > 0n && makerWei > 0n && filledWei === makerWei;
    if (side === "sell" || stubShaped) {
      if (takerWei > 0n)
        cost = weiToDecimal18(takerWei);
    }
    else if (makerWei > 0n) {
      cost = weiToDecimal18(makerWei);
    }
  }
  if (cost <= 0)
    cost = Number(fallbackUsdt) || 0;
  return roundUsdt(cost);
}

/**
 * BUY 订单名义 USDT（限价×份额 / makerAmount；官网订单栏常见 14.12）
 * 与实付 bet_money（成交额）区分。
 * @param {object|null|undefined} official
 * @param {{ shares?: number, bookPrice?: number, fallbackUsdt?: number }} [opts]
 */
export function extractBuyNotionalUsdt(official, opts = {}) {
  const makerWei = parsePredictQuantityToWei(official?.order?.makerAmount);
  const filledWei = parsePredictQuantityToWei(official?.amountFilled);
  const side = orderSide(official);
  // stub 形 maker=份额时，maker 不是 USDT
  const stubShaped = filledWei > 0n && makerWei > 0n && filledWei === makerWei;
  if (!stubShaped && side !== "sell" && makerWei > 0n) {
    const n = weiToDecimal18(makerWei);
    if (n > 0)
      return roundUsdt(n);
  }
  return computePfNotionalUsdt({
    shares: opts.shares,
    bookPrice: opts.bookPrice,
    fallbackUsdt: opts.fallbackUsdt,
  });
}

/**
 * @param {{ shares?: number|string|null, bookPrice?: number|string|null, fallbackUsdt?: number|string|null }} input
 * @returns {number|undefined}
 */
export function computePfNotionalUsdt(input) {
  const s = Number(input?.shares);
  const p = Number(input?.bookPrice);
  if (Number.isFinite(s) && s > 0 && Number.isFinite(p) && p > 0 && p < 1)
    return roundUsdt(s * p);
  const fb = Number(input?.fallbackUsdt);
  if (Number.isFinite(fb) && fb > 0)
    return roundUsdt(fb);
  return undefined;
}

/**
 * SELL FILLED：回款优先 amount（人类 USDT）→ order.takerAmount wei → fallback 预估
 * 份额：amountFilled → order.makerAmount → fallbackSharesWei
 * @param {object|null|undefined} official
 * @param {{ fallbackProceedsUsdt?: number, fallbackSharesWei?: string|bigint }} [opts]
 */
export function extractSellFill(official, opts = {}) {
  const fallbackProceeds = Number(opts.fallbackProceedsUsdt) || 0;
  let sharesWei = parsePredictQuantityToWei(official?.amountFilled);
  if (sharesWei <= 0n)
    sharesWei = parsePredictQuantityToWei(official?.order?.makerAmount);
  if (sharesWei <= 0n) {
    try {
      sharesWei = BigInt(String(opts.fallbackSharesWei ?? "0"));
    }
    catch {
      sharesWei = 0n;
    }
  }

  let proceeds = 0;
  const amountStr = String(official?.amount ?? "").trim();
  if (amountStr.includes(".")) {
    const n = Number(amountStr);
    if (Number.isFinite(n) && n > 0)
      proceeds = n;
  }
  if (proceeds <= 0) {
    const takerWei = parsePredictQuantityToWei(official?.order?.takerAmount);
    if (takerWei > 0n)
      proceeds = weiToDecimal18(takerWei);
  }
  if (proceeds <= 0)
    proceeds = fallbackProceeds;

  return {
    sharesWei,
    shares: weiToDecimal18(sharesWei),
    proceedsUsdt: roundUsdt(proceeds),
    side: orderSide(official),
    amountFilledRaw: official?.amountFilled != null ? String(official.amountFilled) : undefined,
  };
}
