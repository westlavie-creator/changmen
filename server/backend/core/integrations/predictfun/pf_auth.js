/**
 * [Predict 官方] GET /v1/auth/message → 签名 → POST /v1/auth → JWT
 * @see https://dev.predict.fun/ts-how-to-authenticate-your-api-requests-663127m0
 */

import { predictFunGet, predictFunPost } from "./pf_api.js";

const JWT_CACHE_MS = 50 * 60_000;
const jwtCache = new Map();

function cacheKey(apiBase, signer) {
  return `${apiBase}:${String(signer).toLowerCase()}`;
}

export function clearPredictFunHouseJwtCache() {
  jwtCache.clear();
}

export async function fetchPredictFunHouseJwt({
  apiBase,
  signer,
  signMessage,
}) {
  const addr = String(signer ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr))
    throw new Error("Predict.fun 无效 signer 地址");

  const key = cacheKey(apiBase, addr);
  const cached = jwtCache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return cached.token;

  const messageRes = await predictFunGet("/v1/auth/message");
  const message = String(messageRes?.data?.message ?? "").trim();
  if (!message)
    throw new Error("Predict.fun auth/message 无 message");

  const signature = await signMessage(message);
  const jwtRes = await predictFunPost("/v1/auth", {
    signer: addr,
    message,
    signature,
  });
  const token = String(jwtRes?.data?.token ?? "").trim();
  if (!token)
    throw new Error("Predict.fun auth 未返回 JWT");

  jwtCache.set(key, { token, expiresAt: Date.now() + JWT_CACHE_MS });
  return token;
}
