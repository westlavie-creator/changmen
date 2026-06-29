import { BuilderSigner } from "@polymarket/builder-signing-sdk";
import {
  getPolymarketRelayerAuthMode,
  isPolymarketRelayerConfigured,
  loadPolymarketBuilderCreds,
  loadPolymarketRelayerApiKeyAuth,
} from "./relayer_config.js";

/**
 * 返回 Relayer 请求头。SDK remoteBuilderConfig 会 POST 到此逻辑。
 * - relayer_api_key：固定两 header，无需 HMAC
 * - builder_hmac：按 method/path/body 算 POLY_BUILDER_* 签名
 *
 * @param {{ method?: string, path?: string, body?: string, timestamp?: number }} payload
 * @returns {{ ok: true, headers: Record<string, string> } | { ok: false, msg: string }}
 */
export function signPolymarketRelayerRequest(payload) {
  const mode = getPolymarketRelayerAuthMode();
  if (mode === "relayer_api_key") {
    const relayerHeaders = loadPolymarketRelayerApiKeyAuth();
    if (relayerHeaders)
      return { ok: true, headers: { ...relayerHeaders } };
  }

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
  };
}
