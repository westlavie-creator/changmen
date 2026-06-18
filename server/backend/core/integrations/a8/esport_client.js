/**
 * A8 bundle `_r.post`：esport API 使用 form-urlencoded + header `token`。
 */
import { buildFormBody, loginV4 } from "./v4_client.js";
import { resolveA8Credentials } from "./config.js";

const A8_ESPORT_BASE = (process.env.A8_ESPORT_URL || "https://api.a8.to/esport").replace(/\/+$/, "");
const CACHE_MS = Number(process.env.A8_ESPORT_CACHE_MS || 60_000);

/** @type {Map<string, { at: number, value: unknown }>} */
const cache = new Map();

async function postEsport(action, fields, sessionToken) {
  const url = `${A8_ESPORT_BASE}/${String(action).replace(/^\//, "")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      token: sessionToken,
    },
    body: buildFormBody(fields),
    signal: AbortSignal.timeout(Number(process.env.A8_ESPORT_TIMEOUT_MS || 30_000)),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`A8 esport 响应非 JSON (${res.status}): ${text.slice(0, 160)}`);
  }
  if (!res.ok) {
    throw new Error(`A8 esport HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  return data;
}

export async function loginEsportSession() {
  const { userName, password } = resolveA8Credentials();
  const login = await loginV4(userName, password);
  const token = login?.data?.token ?? login?.token;
  if (!token) {
    throw new Error(login?.message || login?.msg || "A8 v4 登录未返回 token");
  }
  return String(token);
}

export async function fetchCollectPlatform(provider, sessionToken) {
  const data = await postEsport("Client_GetCollectPlatform", { provider }, sessionToken);
  if (data?.success === 0) {
    throw new Error(data?.msg || `Client_GetCollectPlatform(${provider}) failed`);
  }
  const info = data?.info;
  if (!info?.Gateway || !info?.Token) {
    throw new Error(`Client_GetCollectPlatform(${provider}) 缺少 Gateway/Token`);
  }
  return {
    gateway: String(info.Gateway),
    token: String(info.Token),
    betName: String(info.BetName || ""),
  };
}

export async function fetchCollectGames(provider, sessionToken) {
  const data = await postEsport("Client_GetGames", { provider }, sessionToken);
  const list = data?.info;
  if (!Array.isArray(list)) return [];
  return list.filter(Boolean).map(String);
}

export async function fetchCollectPlatformWithGames(provider) {
  const key = `platform:${provider}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const sessionToken = await loginEsportSession();
  const platform = await fetchCollectPlatform(provider, sessionToken);
  const games = await fetchCollectGames(provider, sessionToken);
  const value = { ...platform, games, provider };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearEsportClientCache() {
  cache.clear();
}

export { A8_ESPORT_BASE };
