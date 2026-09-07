/**
 * 足球 OB 会话只存在本机 localStorage。禁止写 VPS / platforms.json / ACCOUNT。
 */
import { notifySportObSessionUpdated } from "@/runtime/sportObSessionEvents";
import { resolveObSportWsUrl, type ObSportSessionLite } from "@/runtime/obSportWs";

export const SPORT_OB_SESSION_STORAGE_KEY = "changmen.sportOb.session";

export type SportObSessionLocal = ObSportSessionLite & {
  kind?: string;
  referer?: string;
  api?: string;
  uid?: string;
  lastGateway?: string;
  updatedAt?: number;
  configured?: boolean;
  tokenMasked?: string;
  sessionIdMasked?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return asObject(parsed);
  }
  catch {
    return null;
  }
}

/** 聊天/单行输入会把 base64 折行；atob 遇空白会直接失败。 */
function compactBase64(raw: string): string {
  return String(raw || "")
    .replace(/```(?:json|text)?/gi, "")
    .replace(/`/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
}

function decodeBase64Json(raw: string): Record<string, unknown> | null {
  const compact = compactBase64(raw);
  if (!compact || compact.length < 8)
    return null;
  try {
    const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return tryParseJson(new TextDecoder().decode(bytes));
  }
  catch {
    return null;
  }
}

function parseSportObHref(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim();
  if (!raw)
    return null;
  let url: URL | null = null;
  try {
    url = new URL(raw);
  }
  catch {
    const found = raw.match(/https?:\/\/[^\s"'<>]+/i);
    if (found) {
      try {
        url = new URL(found[0]);
      }
      catch {
        url = null;
      }
    }
  }
  if (!url && /token=/i.test(raw)) {
    try {
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : `?${raw.replace(/^[&?]/, "")}`;
      url = new URL(`https://sport-ob.invalid/${q}`);
    }
    catch {
      url = null;
    }
  }
  if (!url)
    return null;
  const token = (url.searchParams.get("token") || "").trim();
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  const api = url.searchParams.get("api");
  if (!token)
    return null;
  if (!/^[0-9a-f]{16,}$/i.test(token) || /^\d+$/.test(token))
    return null;
  const referer = url.host === "sport-ob.invalid"
    ? ""
    : `${url.protocol}//${url.host}/`;
  return {
    kind: "sport",
    token,
    sessionId,
    api,
    referer,
    href: url.href,
  };
}

function parseLooseInput(input: unknown): Record<string, unknown> | null {
  if (input == null)
    return null;
  if (typeof input === "object")
    return asObject(input);
  const text = String(input).trim();
  if (!text)
    return null;
  return tryParseJson(text) || decodeBase64Json(text) || parseSportObHref(text);
}

export function looksLikeEsportObCollect(parsed: unknown): boolean {
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

export function looksLikeSportObCollect(parsed: unknown): boolean {
  const row = asObject(parsed);
  if (!row)
    return false;
  if (String(row.kind || "").toLowerCase() === "sport")
    return true;
  const token = String(row.token || "").trim();
  const sessionId = String(row.sessionId || row.uid || "").trim();
  if (token && /^[0-9a-f]{16,}$/i.test(token) && !/^\d+$/.test(token)) {
    if (sessionId || row.gateway || row.referer || row.api != null)
      return true;
  }
  return false;
}

function firstGateway(value: unknown): string {
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

function maskSecret(value: string, keep = 4): string {
  const s = String(value || "");
  if (s.length <= keep)
    return s ? "****" : "";
  return `${s.slice(0, keep)}…${s.slice(-2)}`;
}

export function parseSportObSessionInput(input: unknown): { ok: true; session: SportObSessionLocal } | { ok: false; msg: string } {
  const parsed = parseLooseInput(input) || asObject(input);
  if (!parsed)
    return { ok: false, msg: "无法解析体育 OB 会话" };
  if (looksLikeEsportObCollect(parsed))
    return { ok: false, msg: "这是电竞 OB 凭证，请贴到电竞采集，勿写入足球会话" };
  const token = String(parsed.token || "").trim();
  const sessionId = String(parsed.sessionId || parsed.uid || "").trim();
  const gateway = firstGateway(parsed.gateway);
  if (!token)
    return { ok: false, msg: "缺少 token" };
  if (/^\d+$/.test(token))
    return { ok: false, msg: "这是电竞 OB token，请贴到电竞采集" };
  if (!/^[0-9a-f]{16,}$/i.test(token))
    return { ok: false, msg: "体育 OB token 应为十六进制" };
  const isSportKind = String(parsed.kind || "").toLowerCase() === "sport";
  if (!sessionId && !isSportKind)
    return { ok: false, msg: "缺少 sessionId" };
  const session: SportObSessionLocal = {
    kind: "sport",
    token,
    sessionId,
    gateway,
    api: String(parsed.api || "").trim(),
    referer: String(parsed.referer || "").trim(),
    wsUrl: String(parsed.wsUrl || parsed.ws || "").trim(),
    uid: String(parsed.uid || "").trim(),
    updatedAt: Date.now(),
  };
  session.wsUrl = resolveObSportWsUrl(session) || session.wsUrl;
  return { ok: true, session };
}

export function mergeIncomingSportObSession(
  incoming: SportObSessionLocal,
  prev: SportObSessionLocal | null,
): SportObSessionLocal {
  const incomingGw = firstGateway(incoming.gateway);
  const keptGw = firstGateway(prev?.gateway) || firstGateway(prev?.lastGateway);
  const gateway = incomingGw || keptGw;
  const token = String(incoming.token || "").trim();
  const next: SportObSessionLocal = {
    ...incoming,
    kind: "sport",
    gateway,
    lastGateway: gateway || keptGw,
    referer: String(incoming.referer || prev?.referer || "").trim(),
    api: String(incoming.api || prev?.api || "").trim(),
    sessionId: String(incoming.sessionId || prev?.sessionId || "").trim(),
    token,
    updatedAt: Date.now(),
  };
  next.wsUrl = resolveObSportWsUrl(next) || String(incoming.wsUrl || "").trim();
  return next;
}

export function readLocalSportObSession(): SportObSessionLocal | null {
  try {
    const raw = localStorage.getItem(SPORT_OB_SESSION_STORAGE_KEY);
    if (!raw)
      return null;
    const row = asObject(JSON.parse(raw));
    if (!row || !String(row.token || "").trim())
      return null;
    return row as SportObSessionLocal;
  }
  catch {
    return null;
  }
}

export function publicLocalSportObSession(): SportObSessionLocal {
  const row = readLocalSportObSession();
  if (!row)
    return { configured: false };
  return {
    ...row,
    configured: true,
    tokenMasked: maskSecret(String(row.token || "")),
    sessionIdMasked: maskSecret(String(row.sessionId || "")),
  };
}

export function writeLocalSportObSession(session: SportObSessionLocal): SportObSessionLocal {
  const merged = mergeIncomingSportObSession(session, readLocalSportObSession());
  localStorage.setItem(SPORT_OB_SESSION_STORAGE_KEY, JSON.stringify(merged));
  notifySportObSessionUpdated();
  return merged;
}

export function saveLocalSportObSessionFromPaste(raw: string): SportObSessionLocal {
  const parsed = parseSportObSessionInput(raw);
  if (!parsed.ok)
    throw new Error(parsed.msg);
  return writeLocalSportObSession(parsed.session);
}

export function clearLocalSportObSession() {
  localStorage.removeItem(SPORT_OB_SESSION_STORAGE_KEY);
  notifySportObSessionUpdated();
}
