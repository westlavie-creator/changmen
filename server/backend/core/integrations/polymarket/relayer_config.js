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
  if (loadPolymarketRelayerApiKeyAuth())
    return "relayer_api_key";
  if (loadPolymarketBuilderCreds())
    return "builder_hmac";
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
