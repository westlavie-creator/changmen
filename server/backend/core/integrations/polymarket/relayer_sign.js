import { BuilderSigner } from "@polymarket/builder-signing-sdk";
import {
  getPolymarketRelayerAuthMode,
  isPolymarketRelayerConfigured,
  loadPolymarketBuilderCreds,
  loadPolymarketRelayerApiKeyAuth,
} from "./relayer_config.js";
import { signPolymarketRelayerRequestUnified } from "./relayer_sign_unified.js";

/**
 * Relayer HMAC 实现选型。默认 legacy（builder-signing-sdk）。
 * 备选 unified → relayer_sign_unified.js（@polymarket/client.buildHmacSignature）。
 * 环境变量：POLYMARKET_RELAYER_SIGN_SDK=legacy|unified
 */
export function resolvePolymarketRelayerSignSdk() {
  const raw = String(process.env.POLYMARKET_RELAYER_SIGN_SDK || "").trim().toLowerCase();
  if (raw === "unified" || raw === "client" || raw === "ts-sdk")
    return "unified";
  return "legacy";
}

/**
 * 返回 Relayer 请求头。SDK remoteBuilderConfig / remoteBuilderSigning 会 POST 到此逻辑。
 * - relayer_api_key：固定两 header，无需 HMAC
 * - builder_hmac：按 method/path/body 算 POLY_BUILDER_* 签名
 *
 * @param {{ method?: string, path?: string, body?: string, timestamp?: number }} payload
 * @returns {Promise<{ ok: true, headers: Record<string, string> } | { ok: false, msg: string }>}
 */
export async function signPolymarketRelayerRequest(payload) {
  const mode = getPolymarketRelayerAuthMode();
  if (mode === "relayer_api_key") {
    const relayerHeaders = loadPolymarketRelayerApiKeyAuth();
    if (relayerHeaders)
      return { ok: true, headers: { ...relayerHeaders } };
  }

  if (resolvePolymarketRelayerSignSdk() === "unified")
    return signPolymarketRelayerRequestUnified(payload);

  const creds = loadPolymarketBuilderCreds();
  if (!creds) {
    return {
      ok: false,
      msg: "Polymarket Relayer 未配置（changmen 推荐 POLY_BUILDER_* 三组；或 RELAYER_API_KEY + 与用户私钥同地址的 ADDRESS）",
    };
  }

  const method = String(payload?.method || "").trim().toUpperCase();
  const path = String(payload?.path || "").trim();
  if (!method || !path)
    return { ok: false, msg: "缺少 method 或 path" };

  const body = payload?.body === undefined || payload?.body === null
    ? undefined
    : String(payload.body);
  const timestamp = payload?.timestamp === undefined || payload?.timestamp === null
    ? undefined
    : Number(payload.timestamp);

  const signer = new BuilderSigner(creds);
  const headers = signer.createBuilderHeaderPayload(
    method,
    path,
    body,
    Number.isFinite(timestamp) ? timestamp : undefined,
  );
  return { ok: true, headers };
}

export function getPolymarketRelayerPublicStatus() {
  return {
    configured: isPolymarketRelayerConfigured(),
    authMode: getPolymarketRelayerAuthMode(),
    signSdk: resolvePolymarketRelayerSignSdk(),
  };
}
