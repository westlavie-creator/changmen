/**
 * 体育 OB 采集会话（足球 HTTP/WS 专用）。
 * 禁止写入 platforms.json / ACCOUNT / 电竞 client_matches。
 */
import fs from "node:fs";
import path from "node:path";
import { ESPORT_DATA_DIR } from "../shared/storage_paths.js";

const SESSION_FILE = "ob_session.json";

function sportSessionPath() {
  const sportRoot = path.resolve(ESPORT_DATA_DIR, "sport");
  const filePath = path.resolve(sportRoot, SESSION_FILE);
  if (!filePath.startsWith(sportRoot + path.sep) && filePath !== path.join(sportRoot, SESSION_FILE))
    throw new Error("sport ob session path escaped sport/ root");
  if (filePath.includes(`${path.sep}client_matches`) || filePath.includes(`${path.sep}legacy${path.sep}esport`))
    throw new Error("sport ob session must not touch esport lists");
  return filePath;
}

function tryParseJson(raw) {
  if (!raw || typeof raw !== "string")
    return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  }
  catch {
    return null;
  }
}

function decodeBase64Json(raw) {
  const text = String(raw || "").trim();
  if (!text)
    return null;
  try {
    const json = Buffer.from(text, "base64").toString("utf8");
    return tryParseJson(json);
  }
  catch {
    return null;
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * 插件电竞 data：token 多为纯数字，且带 addr.api[] / 无 sessionId。
 * @param {object} parsed
 */
export function looksLikeEsportObCollect(parsed) {
  const row = asObject(parsed);
  if (!row)
    return false;
  if (String(row.kind || "").toLowerCase() === "esport")
    return true;
  if (row.addr)
    return true;
  const token = String(row.token || "").trim();
  if (token && /^\d+$/.test(token) && !row.sessionId)
    return true;
  return false;
}

/**
 * 插件体育 data：kind=sport，或 hex token + sessionId。
 * @param {object} parsed
 */
export function looksLikeSportObCollect(parsed) {
  const row = asObject(parsed);
  if (!row)
    return false;
  if (String(row.kind || "").toLowerCase() === "sport")
    return true;
  const token = String(row.token || "").trim();
  const sessionId = String(row.sessionId || "").trim();
  if (sessionId && token && /^[0-9a-f]{16,}$/i.test(token) && !/^\d+$/.test(token))
    return true;
  return false;
}

function parseLooseInput(input) {
  if (input == null)
    return null;
  if (typeof input === "object")
    return asObject(input);
  const text = String(input).trim();
  if (!text)
    return null;
  return tryParseJson(text) || decodeBase64Json(text) || null;
}

/**
 * API_UpdatePlatform(OB) 拦截：体育会话不得写入电竞 platforms.json。
 * @param {Record<string, unknown>} body
 */
export function looksLikeSportObCollectPaste(body) {
  const row = asObject(body) || {};
  const token = String(row.token || "").trim();
  if (token && /^[0-9a-f]{16,}$/i.test(token) && !/^\d+$/.test(token))
    return true;
  const parsed = parseLooseInput(token) || parseLooseInput(row.data) || parseLooseInput(row.Value);
  return looksLikeSportObCollect(parsed);
}

/** 九游/OB 体育 PC：wss://{API origin}/yewuws2/push?requestId={token} */
export const OB_SPORT_WS_PATH = "/yewuws2/push";

export function deriveObSportPushUrl(gateway, token) {
  const gw = String(gateway || "").trim();
  const tok = String(token || "").trim();
  if (!gw || !tok)
    return "";
  try {
    const u = new URL(gw);
    if (u.protocol !== "http:" && u.protocol !== "https:")
      return "";
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    const q = new URLSearchParams();
    q.set("requestId", tok);
    return `${proto}//${u.host}${OB_SPORT_WS_PATH}?${q}`;
  }
  catch {
    return "";
  }
}

function looksLikeMqttUrl(url) {
  return /mqtt/i.test(String(url || ""));
}

export function resolveSportObPushUrl(session) {
  const row = session && typeof session === "object" ? session : {};
  const token = String(row.token || "").trim();
  const explicit = String(row.wsUrl || "").trim();
  if (/^wss?:\/\//i.test(explicit) && !looksLikeMqttUrl(explicit)) {
    try {
      const u = new URL(explicit);
      if (!u.searchParams.get("requestId") && token)
        u.searchParams.set("requestId", token);
      return u.toString();
    }
    catch {
      return explicit;
    }
  }
  return deriveObSportPushUrl(String(row.gateway || ""), token);
}

function firstGateway(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = String(item || "").trim().replace(/\/$/, "");
      if (s)
        return s;
    }
    return "";
  }
  return String(value || "").trim().replace(/\/$/, "");
}

function lastGatewayHintPath() {
  return path.join(path.dirname(sportSessionPath()), "ob_last_gateway.txt");
}

function readLastGatewayHint() {
  try {
    const raw = fs.readFileSync(lastGatewayHintPath(), "utf8").trim().replace(/\/$/, "");
    return /^https?:\/\//i.test(raw) ? raw : "";
  }
  catch {
    return "";
  }
}

function writeLastGatewayHint(gateway) {
  const gw = firstGateway(gateway);
  if (!gw || !/^https?:\/\//i.test(gw))
    return;
  fs.mkdirSync(path.dirname(lastGatewayHintPath()), { recursive: true });
  fs.writeFileSync(lastGatewayHintPath(), `${gw}\n`, "utf8");
}

/**
 * 插件在壳页/iframe 常嗅不到 api.*，gateway 会是 []。
 * 新粘贴缺网关时沿用上次成功的 HTTP origin，才能推导 wss://…/yewuws2/push。
 * @param {object} incoming
 * @param {object|null} [prev]
 * @param {string} [lastGatewayHint]
 */
export function mergeIncomingSportObSession(incoming, prev = null, lastGatewayHint = "") {
  const next = incoming && typeof incoming === "object" ? { ...incoming } : {};
  const prevRow = prev && typeof prev === "object" ? prev : {};
  const incomingGw = firstGateway(next.gateway);
  const keptGw =
    firstGateway(prevRow.gateway)
    || firstGateway(prevRow.lastGateway)
    || firstGateway(lastGatewayHint);
  const gateway = incomingGw || keptGw;
  const token = String(next.token || "").trim();
  return {
    ...next,
    kind: "sport",
    gateway,
    lastGateway: gateway || keptGw,
    referer: String(next.referer || prevRow.referer || "").trim(),
    api: String(next.api || prevRow.api || "").trim(),
    wsUrl: deriveObSportPushUrl(gateway, token) || String(next.wsUrl || "").trim(),
  };
}

/**
 * @param {unknown} input 插件「数据」base64/JSON，或 { token, sessionId, gateway, ... }
 * @returns {{ ok: true, session: object } | { ok: false, msg: string }}
 */
export function parseSportObSessionInput(input) {
  const direct = asObject(input);
  const parsed = parseLooseInput(input) || direct;
  if (!parsed)
    return { ok: false, msg: "无法解析体育 OB 会话" };
  if (looksLikeEsportObCollect(parsed))
    return { ok: false, msg: "这是电竞 OB 凭证，请贴到电竞采集，勿写入足球会话" };

  const token = String(parsed.token || "").trim();
  const sessionId = String(parsed.sessionId || "").trim();
  const gateway = firstGateway(parsed.gateway);
  if (!token)
    return { ok: false, msg: "缺少 token" };
  if (/^\d+$/.test(token))
    return { ok: false, msg: "这是电竞 OB token，请贴到电竞采集" };
  if (!/^[0-9a-f]{16,}$/i.test(token))
    return { ok: false, msg: "体育 OB token 应为十六进制" };
  if (!sessionId)
    return { ok: false, msg: "缺少 sessionId" };

  return {
    ok: true,
    session: {
      kind: "sport",
      token,
      sessionId,
      gateway,
      api: String(parsed.api || "").trim(),
      referer: String(parsed.referer || "").trim(),
      wsUrl: String(parsed.wsUrl || parsed.ws || "").trim(),
      uid: String(parsed.uid || "").trim(),
      updatedAt: Date.now(),
    },
  };
}

/**
 * @returns {object|null}
 */
export function readSportObSession() {
  const filePath = sportSessionPath();
  if (!fs.existsSync(filePath))
    return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object")
      return null;
    const token = String(data.token || "").trim();
    if (!token)
      return null;
    return data;
  }
  catch (err) {
    console.warn("[sportObSession] read failed", err?.message || err);
    return null;
  }
}

/**
 * @param {object} session
 */
export function writeSportObSession(session) {
  const filePath = sportSessionPath();
  const merged = mergeIncomingSportObSession(session, readSportObSession(), readLastGatewayHint());
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  if (merged.gateway)
    writeLastGatewayHint(merged.gateway);
  return merged;
}

export function clearSportObSession() {
  const filePath = sportSessionPath();
  if (fs.existsSync(filePath))
    fs.unlinkSync(filePath);
}

function maskSecret(value, keep = 4) {
  const s = String(value || "");
  if (s.length <= keep)
    return s ? "****" : "";
  return `${s.slice(0, keep)}…${s.slice(-2)}`;
}

/** 给前端展示用（仍回完整 token，供浏览器直连体育 WS；不写 ACCOUNT） */
export function publicSportObSession() {
  const row = readSportObSession();
  if (!row)
    return { configured: false };
  return {
    configured: true,
    kind: "sport",
    token: String(row.token || ""),
    sessionId: String(row.sessionId || ""),
    gateway: String(row.gateway || ""),
    referer: String(row.referer || ""),
    wsUrl: resolveSportObPushUrl(row),
    updatedAt: Number(row.updatedAt) || 0,
    tokenMasked: maskSecret(row.token),
    sessionIdMasked: maskSecret(row.sessionId, 6),
  };
}
