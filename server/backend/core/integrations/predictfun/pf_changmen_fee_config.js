/**
 * Changmencodefee 已随会员中转下线：读写恒为 0，不再落盘计费。
 */
export function clampPfChangmenFeeRateBps(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0)
    return 0;
  return Math.min(10_000, Math.floor(v));
}

/** @returns {{ buyFeeRateBps: number, sellFeeRateBps: number, updatedAt?: number, removed: true }} */
export function getPfChangmenFeeConfig() {
  return { buyFeeRateBps: 0, sellFeeRateBps: 0, removed: true };
}

export function savePfChangmenFeeConfig(_body = {}) {
  return getPfChangmenFeeConfig();
}

export function resolvePfChangmenBuyFeeRateBps() {
  return 0;
}

export function resolvePfChangmenSellFeeRateBps() {
  return 0;
}

/** @deprecated 使用 resolvePfChangmenBuyFeeRateBps / Sell */
export function resolvePfChangmenFeeRateBps() {
  return 0;
}
