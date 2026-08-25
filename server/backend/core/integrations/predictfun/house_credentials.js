/**
 * Predict.fun 凭证解析。
 * - API_KEY / API_BASE：采集、中继、官网 REST（热路径）
 * - PRIVY / PREDICT_ACCOUNT：仅运维 Get-by-hash / 旧 house 脚本（用户自签不依赖）
 */

export function resolvePredictFunApiBase() {
  return String(process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun").replace(/\/+$/, "");
}

export function resolvePredictFunApiKey() {
  return String(process.env.PREDICT_FUN_API_KEY || "").trim();
}

/** @deprecated 用户自签路径不读主号钥；仅旧 GetOrder house JWT / 运维脚本 */
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

/** @deprecated house 单笔上限；用户自签不强制 */
export function resolvePfHouseMaxStakeUsdt() {
  const n = Number(process.env.PF_HOUSE_MAX_STAKE_USDT);
  if (Number.isFinite(n) && n > 0)
    return n;
  return 500;
}

/**
 * Changmencodefee 费率（bps）— 恒为 0（已下线）。
 */
export {
  resolvePfChangmenFeeRateBps,
  resolvePfChangmenBuyFeeRateBps,
  resolvePfChangmenSellFeeRateBps,
} from "./pf_changmen_fee_config.js";

/** 采集/中继就绪：只需 API Key（不再要求 PRIVY） */
export function isPredictFunHouseConfigured() {
  return Boolean(resolvePredictFunApiKey());
}
