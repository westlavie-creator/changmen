import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BACKEND_ROOT } from "../../backend/_paths.js";
import { ESPORT_DATA_DIR } from "../../../gamebet_backend/core/shared/storage_paths.js";
import { getActivePlatformGameIds } from "../../../packages/shared/catalog/game_catalog.mjs";

const PLATFORMS_FILE = path.join(ESPORT_DATA_DIR, "platforms.json");

const EURO_ODDS_QUERY_BASE =
  "sportId=12&isHlE=false&oddsType=1&version=0" +
  "&language=zh-cn&isHomePage=&leagueCode=&eventType=0&eSportCode=" +
  "&periodNum=0%2C1%2C2%2C3%2C4%2C5%2C6%2C7&participant=&locale=zh_CN";

export const DEFAULT_ODDS_QUERY = `${EURO_ODDS_QUERY_BASE}&isLive=true`;

function detectPbSessionSuffix(appData, outer) {
  for (const key of Object.keys(appData || {})) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m) return m[1];
  }
  for (const key of Object.keys(appData || {})) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return m[1];
  }
  for (const key of Object.keys(outer || {})) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return m[1];
  }
  return "515";
}

function mergeInnerTokenHeaders(headers, outer) {
  const innerRaw = outer?.token;
  if (!innerRaw) return;
  try {
    const inner = typeof innerRaw === "string" ? JSON.parse(innerRaw) : innerRaw;
    for (const [key, value] of Object.entries(inner)) {
      if (value == null || value === "") continue;
      headers[key.toLowerCase()] = String(value);
    }
  } catch {
    /* optional nested auth headers */
  }
}

/**
 * 与 A8 bundle P0() 相同：account.token 为 JSON 字符串。
 * 会话后缀（515 / 1228 等）从 x-app-data 动态识别。
 */
export function buildAuthHeaders(session, extra = {}) {
  if (!session?.token) return null;
  try {
    const outer = typeof session.token === "string" ? JSON.parse(session.token) : session.token;
    const appData = JSON.parse(outer["x-app-data"] || "{}");
    const suffix = detectPbSessionSuffix(appData, outer);
    const browserSessionKey = `BrowserSessionId_${suffix}`;
    const custidAppKey = `custid_${suffix}`;
    const custidOuterKey = `custid_${suffix}`;
    const custidRaw =
      appData[custidAppKey] ||
      outer[custidOuterKey] ||
      outer.custid_515 ||
      "";
    const headers = {
      "x-app-data": `${Object.keys(appData)
        .map((k) => `${k}=${appData[k]}`)
        .join(";")};`,
      [`x-browser-session-id-${suffix}`]: appData[browserSessionKey] || "",
      [`x-custid-${suffix}`]: decodeURIComponent(String(custidRaw).replace(/\+/g, "%20")),
      "v-hucode": outer["v-hucode"] || "",
      "x-requested-with": "XMLHttpRequest",
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        session.userAgent ||
        process.env.PB_USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    mergeInnerTokenHeaders(headers, outer);
    if (session.cookie || process.env.PB_COOKIE) {
      headers.Cookie = session.cookie || process.env.PB_COOKIE;
    }
    if (session.referer) {
      headers.Referer = session.referer;
    }
    return { ...headers, ...extra };
  } catch (err) {
    throw new Error(`PB token 解析失败: ${err.message}`);
  }
}

function normalizeGateway(gateway) {
  return String(gateway || "").replace(/\/+$/, "");
}

function loadFromPlatformsJson() {
  try {
    if (!fs.existsSync(PLATFORMS_FILE)) return null;
    const all = JSON.parse(fs.readFileSync(PLATFORMS_FILE, "utf8"));
    const row = all.PB;
    if (!row?.gateway || !row?.token) return null;
    return {
      gateway: normalizeGateway(row.gateway),
      token: row.token,
      cookie: row.cookie || "",
      referer: row.referer || row.gateway,
      userAgent: row.userAgent || "",
      gameSlugs: Array.isArray(row.games) ? row.games.map(String) : getActivePlatformGameIds("PB"),
    };
  } catch {
    return null;
  }
}

function loadFromEnv() {
  const gateway = process.env.PB_GATEWAY;
  const token = process.env.PB_TOKEN;
  if (!gateway || !token) return null;
  return {
    gateway: normalizeGateway(gateway),
    token,
    cookie: process.env.PB_COOKIE || "",
    referer: process.env.PB_REFERER || gateway,
    userAgent: process.env.PB_USER_AGENT || "",
    gameSlugs: process.env.PB_GAME_SLUGS
      ? process.env.PB_GAME_SLUGS.split(/[,;\s]+/).filter(Boolean)
      : getActivePlatformGameIds("PB"),
  };
}

/** 仅读 platforms.json（下注账号 / import-platform 写入），不读 PB_GATEWAY/PB_TOKEN 环境变量 */
export function loadPlatformsJsonSession() {
  const session = loadFromPlatformsJson();
  if (!session) {
    throw new Error(
      "缺少 PB 凭证：请用 npm run account:import-platform -- <插件data> 写入 gamebet_backend/data/esport/platforms.json",
    );
  }
  if (!buildAuthHeaders(session)) {
    throw new Error("PB token 无效，需为含 x-app-data / BrowserSessionId_* 的 JSON 字符串");
  }
  return session;
}

export function loadSession() {
  const session = loadFromEnv() || loadFromPlatformsJson();
  if (!session) {
    throw new Error(
      "缺少 PB 凭证：设置 PB_GATEWAY + PB_TOKEN，或在 gamebet_backend/data/esport/platforms.json 配置 PB",
    );
  }
  if (!buildAuthHeaders(session)) {
    throw new Error("PB token 无效，需为含 x-app-data / BrowserSessionId_* 的 JSON 字符串");
  }
  return session;
}

export function tryLoadSession() {
  try {
    return loadSession();
  } catch {
    return null;
  }
}

export function oddsUrl(session, isLive = true) {
  const base = `${session.gateway}/sports-service/sv/euro/odds`;
  const ts = Date.now();
  return `${base}?${EURO_ODDS_QUERY_BASE}&isLive=${isLive}&timeStamp=${ts}&_=${ts}&withCredentials=true`;
}

function mergeEuroOddsPayloads(...payloads) {
  const leagueByKey = new Map();
  const eventByLeague = new Map();

  for (const payload of payloads) {
    for (const league of payload?.leagues || []) {
      const leagueKey = String(league.id ?? `${league.gameCode}:${league.name}`);
      if (!leagueByKey.has(leagueKey)) {
        leagueByKey.set(leagueKey, { ...league, events: [] });
        eventByLeague.set(leagueKey, new Map());
      }
      const events = eventByLeague.get(leagueKey);
      for (const event of league.events || []) {
        events.set(String(event.id), event);
      }
    }
  }

  return {
    leagues: [...leagueByKey.entries()].map(([key, league]) => ({
      ...league,
      events: [...(eventByLeague.get(key)?.values() || [])],
    })),
  };
}

function balanceUrl(session) {
  return `${session.gateway}/member-service/v2/account-balance?locale=zh_CN&_=${Date.now()}&withCredentials=true`;
}

async function pbFetch(session, url, options = {}) {
  const headers = buildAuthHeaders(session, options.headers || {});
  if (!headers) throw new Error("无法构建 PB 请求头");

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
    signal: AbortSignal.timeout(options.timeoutMs || 20000),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`PB 响应非 JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`PB HTTP ${res.status}: ${data?.message || data?.error || text.slice(0, 120)}`);
  }
  return data;
}

export async function fetchEuroOdds(session) {
  const [liveData, prematchData] = await Promise.all([
    pbFetch(session, oddsUrl(session, true)),
    pbFetch(session, oddsUrl(session, false)),
  ]);
  return mergeEuroOddsPayloads(liveData, prematchData);
}

export async function fetchBalance(session, options = {}) {
  const multiply = Math.max(1, Number(options.multiply) || 1);
  const data = await pbFetch(session, balanceUrl(session), { method: "POST", body: "" });
  if (data?.error) {
    const code = String(data.error);
    throw new Error(/MULTIPLE_LOGIN|SESSION|LOGIN|UNAUTHOR/i.test(code) ? "token error" : code);
  }
  if (data?.success === false) {
    throw new Error(data.message || "PB balance failed");
  }
  if (data?.betCredit == null && data?.success !== true) {
    throw new Error("PB balance 响应无效");
  }
  return {
    balance: (Number(data.betCredit) || 0) * multiply,
    currency: data.currency || "USD",
    raw: data,
  };
}

/** PB token 外层 `a` 字段（base64 JSON）里缓存的 betCredit，会话失效时可作展示回退 */
export function parsePbTokenBalance(token) {
  if (!token) return null;
  try {
    const outer = typeof token === "string" ? JSON.parse(token) : token;
    const a = outer?.a;
    if (!a) return null;
    const decoded = JSON.parse(Buffer.from(String(a), "base64").toString("utf8"));
    const betCredit = Number(decoded.betCredit);
    if (Number.isNaN(betCredit)) return null;
    return {
      balance: betCredit,
      currency: decoded.currency || "CNY",
      cached: true,
    };
  } catch {
    return null;
  }
}

export function persistPlatform(session) {
  const href = pathToFileURL(path.join(BACKEND_ROOT, "core/esport-api/store.js")).href;
  import(href)
    .then((mod) => {
      const store = mod.default;
      store.ensureSeed();
      store.setPlatform("PB", {
        gateway: session.gateway,
        token: typeof session.token === "string" ? session.token : JSON.stringify(session.token),
        betName: store.getPlatform("PB")?.betName || ".*",
        games: (session.gameSlugs || getActivePlatformGameIds("PB")).map(String),
        cookie: session.cookie || "",
        referer: session.referer || "",
        userAgent: session.userAgent || "",
      });
    })
    .catch(() => {
      /* optional */
    });
}
