/**
 * Predict.fun 运营主号（B）凭证 — 仅 process.env，禁止 VITE_*。
 */

export function resolvePredictFunApiBase() {
  return String(process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun").replace(/\/+$/, "");
}

export function resolvePredictFunApiKey() {
  return String(process.env.PREDICT_FUN_API_KEY || "").trim();
}

export function resolvePredictFunHouseCredentials() {
  const privateKeyRaw = String(
    process.env.PREDICT_FUN_PRIVY_PRIVATE_KEY
      || process.env.PREDICT_FUN_MASTER_PRIVATE_KEY
      || "",
  ).trim();
  const predictAccount = String(process.env.PREDICT_FUN_PREDICT_ACCOUNT || "").trim();
  if (!privateKeyRaw)
    return null;
  const privateKey = privateKeyRaw.startsWith("0x") ? privateKeyRaw : `0x${privateKeyRaw}`;
  return {
    privateKey,
    predictAccount: predictAccount || undefined,
  };
}

export function resolvePfHouseMaxStakeUsdt() {
  const n = Number(process.env.PF_HOUSE_MAX_STAKE_USDT);
  if (Number.isFinite(n) && n > 0)
    return n;
  return 500;
}

/**
 * Changmencodefee 费率（bps）。
 * 持久化配置见 pf_changmen_fee_config.js；此处 re-export 供旧 import 兼容。
 */
export {
  resolvePfChangmenFeeRateBps,
  resolvePfChangmenBuyFeeRateBps,
  resolvePfChangmenSellFeeRateBps,
} from "./pf_changmen_fee_config.js";

export function isPredictFunHouseConfigured() {
  return Boolean(resolvePredictFunApiKey() && resolvePredictFunHouseCredentials()?.privateKey);
}
