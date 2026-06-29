/** Polymarket Relayer 鉴权凭据存服务端，勿进前端 bundle */

export function loadPolymarketRelayerApiKeyAuth() {
  const apiKey = String(process.env.RELAYER_API_KEY || "").trim();
  const address = String(
    process.env.RELAYER_API_KEY_ADDRESS || process.env.RELAYER_API_KEY_OWNER || "",
  ).trim();
  if (!apiKey || !address)
    return undefined;
  return {
    RELAYER_API_KEY: apiKey,
    RELAYER_API_KEY_ADDRESS: address,
  };
}

/** 旧版 Builder API Keys（三组 + 每笔请求 HMAC）；与 Relayer 仍兼容 */
export function loadPolymarketBuilderCreds() {
  const key = String(
    process.env.POLY_BUILDER_API_KEY || process.env.POLY_BUILDER_KEY || "",
  ).trim();
  const secret = String(process.env.POLY_BUILDER_SECRET || "").trim();
  const passphrase = String(process.env.POLY_BUILDER_PASSPHRASE || "").trim();
  if (!key || !secret || !passphrase)
    return undefined;
  return { key, secret, passphrase };
}

export function getPolymarketRelayerAuthMode() {
  const forced = String(process.env.POLYMARKET_RELAYER_AUTH || "").trim().toLowerCase();
  if (forced === "relayer_api_key" && loadPolymarketRelayerApiKeyAuth())
    return "relayer_api_key";
  if (forced === "builder_hmac" && loadPolymarketBuilderCreds())
    return "builder_hmac";
  // changmen 默认 Builder HMAC：Builder 代多用户付 gas。
  // Relayer API Key 要求 key 地址 = 交易 from（用户私钥地址），仅适合单地址自用。
  if (loadPolymarketBuilderCreds())
    return "builder_hmac";
  if (loadPolymarketRelayerApiKeyAuth())
    return "relayer_api_key";
  return null;
}

export function getPolymarketRelayerUrl() {
  return String(
    process.env.POLYMARKET_RELAYER_URL || "https://relayer-v2.polymarket.com",
  ).trim().replace(/\/+$/, "");
}

export function isPolymarketRelayerConfigured() {
  return getPolymarketRelayerAuthMode() !== null;
}
