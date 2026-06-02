"use strict";

const { resolveA8Credentials } = require("./config.js");
const { loginV4 } = require("./v4_client.js");

const A8_ESPORT_BASE = (process.env.A8_ESPORT_URL || "https://api.a8.to/esport/").replace(/\/?$/, "/");

/** 对齐 A8 bundle `_r.post`：application/x-www-form-urlencoded + header `token` */
async function postEsport(action, body = {}, token) {
  const url = `${A8_ESPORT_BASE}${action.replace(/^\//, "")}`;
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (token) headers.token = token;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(
      Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, v == null ? "" : String(v)]),
      ),
    ).toString(),
    signal: AbortSignal.timeout(Number(process.env.A8_ESPORT_TIMEOUT_MS || 30000)),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`A8 esport 响应非 JSON (${res.status}): ${text.slice(0, 160)}`);
  }
  return { status: res.status, data, text };
}

/** esport Client_Login 或 v4 login（TJ01 等账号仅 v4 有效） */
async function loginEsport(credentials) {
  const creds = credentials || resolveA8Credentials();
  const { data } = await postEsport("Client_Login", {
    userName: creds.userName,
    password: creds.password,
  });
  if (data?.success === 1 && data?.info?.token) {
    return data.info.token;
  }
  const v4 = await loginV4(creds.userName, creds.password);
  if (v4?.success !== 1 || !v4?.info?.token) {
    throw new Error(v4?.msg || data?.msg || "A8 登录失败");
  }
  return v4.info.token;
}

/** 对齐 A8 Vt.getPlatform(provider) */
async function fetchCollectPlatform(provider, token) {
  const sessionToken = token || (await loginEsport());
  const { data } = await postEsport("Client_GetCollectPlatform", { provider }, sessionToken);
  if (data?.success !== 1) {
    throw new Error(data?.msg || `A8 Client_GetCollectPlatform(${provider}) 失败`);
  }
  const info = data.info || {};
  if (!info.Gateway || !info.Token) {
    throw new Error(data?.msg || `A8 Client_GetCollectPlatform(${provider}) 未返回 Gateway/Token`);
  }
  return {
    gateway: info.Gateway || "",
    token: info.Token || "",
    betName: info.BetName || "",
  };
}

async function fetchGames(provider, token) {
  const sessionToken = token || (await loginEsport());
  const { data } = await postEsport("Client_GetGames", { provider }, sessionToken);
  if (data?.success !== 1) {
    throw new Error(data?.msg || `A8 Client_GetGames(${provider}) 失败`);
  }
  const list = data.info;
  return Array.isArray(list) ? list.filter(Boolean).map(String) : [];
}

async function fetchCollectPlatformWithGames(provider) {
  const sessionToken = await loginEsport();
  const [plat, games] = await Promise.all([
    fetchCollectPlatform(provider, sessionToken),
    fetchGames(provider, sessionToken),
  ]);
  return { ...plat, games };
}

module.exports = {
  A8_ESPORT_BASE,
  postEsport,
  loginEsport,
  fetchCollectPlatform,
  fetchGames,
  fetchCollectPlatformWithGames,
};
