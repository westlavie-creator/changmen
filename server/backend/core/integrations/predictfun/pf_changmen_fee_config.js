/**
 * Changmencodefee 全局买卖费率配置。
 * 落盘：ESPORT_DATA_DIR/pf_changmen_fees.json；未落盘时回退 env。
 *
 * - buyFeeRateBps：买入从持仓份额扣（官网净持仓上再扣）
 * - sellFeeRateBps：卖出从回款 USDT 扣（官网净回款上再扣）
 *
 * @see CHANGMEN_CODE_FEE in pf_changmen_code_fee.js
 */
import { readJsonFile, writeJsonFile } from "@changmen/storage/json_file_store.js";

const FILE = "pf_changmen_fees";

/** @param {unknown} n */
export function clampPfChangmenFeeRateBps(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0)
    return 0;
  return Math.min(10_000, Math.floor(v));
}

function envBuyDefaultBps() {
  return clampPfChangmenFeeRateBps(process.env.PF_CHANGMEN_BUY_FEE_RATE_BPS);
}

function envSellDefaultBps() {
  const sell = process.env.PF_CHANGMEN_SELL_FEE_RATE_BPS;
  if (sell != null && String(sell).trim() !== "")
    return clampPfChangmenFeeRateBps(sell);
  // 兼容旧单项配置
  return clampPfChangmenFeeRateBps(process.env.PF_CHANGMEN_FEE_RATE_BPS);
}

/**
 * @returns {{ buyFeeRateBps: number, sellFeeRateBps: number, updatedAt?: number }}
 */
export function getPfChangmenFeeConfig() {
  const raw = readJsonFile(FILE, null);
  const hasFile = raw && typeof raw === "object";
  const buyFeeRateBps = hasFile && raw.buyFeeRateBps != null
    ? clampPfChangmenFeeRateBps(raw.buyFeeRateBps)
    : envBuyDefaultBps();
  const sellFeeRateBps = hasFile && raw.sellFeeRateBps != null
    ? clampPfChangmenFeeRateBps(raw.sellFeeRateBps)
    : envSellDefaultBps();
  const updatedAt = hasFile && Number(raw.updatedAt) > 0
    ? Number(raw.updatedAt)
    : undefined;
  return {
    buyFeeRateBps,
    sellFeeRateBps,
    ...(updatedAt != null ? { updatedAt } : {}),
  };
}

export function resolvePfChangmenBuyFeeRateBps() {
  return getPfChangmenFeeConfig().buyFeeRateBps;
}

export function resolvePfChangmenSellFeeRateBps() {
  return getPfChangmenFeeConfig().sellFeeRateBps;
}

/** @deprecated 用 resolvePfChangmenSellFeeRateBps */
export function resolvePfChangmenFeeRateBps() {
  return resolvePfChangmenSellFeeRateBps();
}

/**
 * @param {{ buyFeeRateBps?: number, sellFeeRateBps?: number, buyFeeRatePercent?: number, sellFeeRatePercent?: number }} input
 */
export function savePfChangmenFeeConfig(input = {}) {
  let buy = input.buyFeeRateBps;
  let sell = input.sellFeeRateBps;
  if (buy == null && input.buyFeeRatePercent != null)
    buy = Math.round(Number(input.buyFeeRatePercent) * 100);
  if (sell == null && input.sellFeeRatePercent != null)
    sell = Math.round(Number(input.sellFeeRatePercent) * 100);
  const next = {
    buyFeeRateBps: clampPfChangmenFeeRateBps(buy),
    sellFeeRateBps: clampPfChangmenFeeRateBps(sell),
    updatedAt: Date.now(),
  };
  writeJsonFile(FILE, next);
  return getPfChangmenFeeConfig();
}
