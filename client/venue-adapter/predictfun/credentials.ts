/** Predict.fun 账号 token（模式 A：用户可仅 `{ "mode": "house" }` 占位；真实凭证在运营主号 env） */

export interface PredictFunTokenConfig {
  /** house = changmen 占位账号，下注走 masterAccount */
  mode?: string;
  house?: boolean;
  privateKey?: string;
  private_key?: string;
  privyPrivateKey?: string;
  privy_private_key?: string;
  predictAccount?: string;
  predict_account?: string;
  walletAddress?: string;
  address?: string;
}
function parseJsonObject(text: string | undefined): PredictFunTokenConfig | undefined {
  if (!text)
    return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as PredictFunTokenConfig : undefined;
  }
  catch {
    return undefined;
  }
}

export function parsePredictFunTokenConfig(raw: string | undefined): PredictFunTokenConfig {
  const text = raw?.trim();
  if (!text)
    return {};
  return parseJsonObject(text) ?? {};
}

export function resolvePredictFunPrivateKey(config: PredictFunTokenConfig): string {
  const key = String(config.privateKey ?? config.private_key ?? "").trim();
  if (!key)
    return "";
  return key.startsWith("0x") ? key : `0x${key}`;
}

export function resolvePredictFunPrivyPrivateKey(config: PredictFunTokenConfig): string {
  const key = String(config.privyPrivateKey ?? config.privy_private_key ?? "").trim();
  if (!key)
    return "";
  return key.startsWith("0x") ? key : `0x${key}`;
}

export function resolvePredictFunPredictAccount(config: PredictFunTokenConfig): string {
  return String(
    config.predictAccount
    ?? config.predict_account
    ?? config.walletAddress
    ?? config.address
    ?? "",
  ).trim();
}