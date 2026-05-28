"use strict";

/**
 * 解析插件写入剪贴板的 Base64 凭证（对齐 AccountInfoView 粘贴逻辑）。
 */
function parseClipboardCredential(text) {
  if (!text || !String(text).trim()) {
    throw new Error("剪贴板为空");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(String(text).trim(), "base64").toString("utf8"));
  } catch (err) {
    throw new Error(`凭证解析失败: ${err.message}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("凭证格式无效");
  }

  let gateways = payload.gateway;
  if (typeof gateways === "string") gateways = [gateways];
  if (!Array.isArray(gateways)) gateways = [];
  gateways = gateways.map(String).filter(Boolean);
  if (!gateways.length) {
    throw new Error("缺少 gateway");
  }
  if (!payload.provider) {
    throw new Error("缺少 provider");
  }

  return {
    provider: String(payload.provider),
    token: payload.token ?? "",
    referer: payload.referer ?? "",
    userAgent: payload.userAgent ?? "",
    gateways,
    gateway: gateways[0],
  };
}

function encodeClipboardCredential(credential) {
  const body = {
    provider: credential.provider,
    token: credential.token,
    referer: credential.referer || "",
    gateway: Array.isArray(credential.gateways)
      ? credential.gateways
      : [credential.gateway].filter(Boolean),
  };
  if (credential.userAgent) body.userAgent = credential.userAgent;
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

module.exports = { parseClipboardCredential, encodeClipboardCredential };
