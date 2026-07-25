/**
 * 统一 SDK Relayer HMAC（@polymarket/client.buildHmacSignature）。
 * 与 BuilderSigner.createBuilderHeaderPayload 签名结果一致；响应字段保持 POLY_BUILDER_*。
 *
 * 启用：POLYMARKET_RELAYER_SIGN_SDK=unified
 */

import { buildHmacSignature } from "@polymarket/client";
import { loadPolymarketBuilderCreds } from "./relayer_config.js";

/**
 * @param {{ method?: string, path?: string, body?: string, timestamp?: number }} payload
 * @returns {Promise<{ ok: true, headers: Record<string, string> } | { ok: false, msg: string }>}
 */
export async function signPolymarketRelayerRequestUnified(payload) {
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
    ? Math.floor(Date.now() / 1000)
    : Number(payload.timestamp);
  if (!Number.isFinite(timestamp))
    return { ok: false, msg: "timestamp 无效" };

  const signature = await buildHmacSignature(
    creds.secret,
    timestamp,
    method,
    path,
    body,
  );

  return {
    ok: true,
    headers: {
      POLY_BUILDER_API_KEY: creds.key,
      POLY_BUILDER_PASSPHRASE: creds.passphrase,
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: String(Math.floor(timestamp)),
    },
  };
}
