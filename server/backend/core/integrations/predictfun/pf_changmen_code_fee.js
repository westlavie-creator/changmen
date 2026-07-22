/**
 * Changmencodefee — changmen 对 PF 会员的自有中转费（产品名固定）。
 *
 * 用户只认 changmen；changmen 只认 PF 官网；用户读 RDS（已扣 Changmencodefee 后的结果）。
 * - 买入：从持仓份额扣
 * - 卖出：从回款 USDT 扣
 *
 * 落库字段：pfChangmenCodeFee*（兼容读旧 pfChangmenFee*）
 */
export const CHANGMEN_CODE_FEE = "Changmencodefee";

/** @param {Record<string, unknown>|null|undefined} raw */
export function readChangmenCodeFeeRateBps(raw) {
  const n = Number(raw?.pfChangmenCodeFeeRateBps ?? raw?.pfChangmenFeeRateBps);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** @param {Record<string, unknown>|null|undefined} raw */
export function readChangmenCodeFeeShares(raw) {
  const n = Number(raw?.pfChangmenCodeFeeShares ?? raw?.pfChangmenFeeShares);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** @param {Record<string, unknown>|null|undefined} raw */
export function readChangmenCodeFeeUsdt(raw) {
  const n = Number(raw?.pfChangmenCodeFeeUsdt ?? raw?.pfChangmenFeeUsdt);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * @param {{ rateBps?: number, shares?: number, usdt?: number }} parts
 * @returns {Record<string, number>}
 */
export function changmenCodeFeeSavePatch(parts = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  if (Number.isFinite(Number(parts.rateBps)) && Number(parts.rateBps) >= 0)
    out.pfChangmenCodeFeeRateBps = Number(parts.rateBps);
  if (Number.isFinite(Number(parts.shares)) && Number(parts.shares) > 0)
    out.pfChangmenCodeFeeShares = Number(parts.shares);
  if (Number.isFinite(Number(parts.usdt)) && Number(parts.usdt) > 0)
    out.pfChangmenCodeFeeUsdt = Number(parts.usdt);
  return out;
}
