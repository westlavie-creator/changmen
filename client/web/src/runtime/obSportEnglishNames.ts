/**
 * OB 英文队名旁路：tryPlay lang=en 拉同一 mid 的 mhn/man。
 * 只给 POD 对场；不改足球板中文标题，不写 sport session，不订 WS。
 */
import { a8Axios, responseBodyText } from "@changmen/client-core/shared/a8Axios";
import { decodeObSportPbPayload } from "@/runtime/obSportCodec";
import {
  fetchPandaSportTrialRow,
  formatPandaSportTrialPaste,
  PANDA_SPORT_TRIAL_GATEWAY,
} from "@/runtime/obSportTrial";
import {
  parseSportObSessionInput,
  type SportObSessionLocal,
} from "@/runtime/obSportSessionLocal";

const LIST_ODDS_PATH = "/yewu11/v1/w/structureMatchBaseInfoByMidsPB";
const EUID_FOOTBALL = "3020101";
const EUID_FOOTBALL_LIVE = "30002";
const ODDS_BATCH = 12;
const BATCH_GAP_MS = 400;
const RATE_LIMIT_SLEEP_MS = 2_000;
const MAX_RATE_LIMIT_HITS = 5;
const EN_SESSION_TTL_MS = 25 * 60 * 1000;
const JUNK_TEAM = /^(大|小|大球|小球|over|under|o\/u|主队|客队)$/i;

export type ObEnglishTeamNames = {
  home: string;
  away: string;
  league: string;
};

const cache = new Map<string, ObEnglishTeamNames>();
let enSession: SportObSessionLocal | null = null;
let enSessionAt = 0;

function isC8Mid(mid: string): boolean {
  return /^\d{4,12}$/.test(String(mid || "").trim());
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uuidNoDash() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, "");
}

function isJunkTeam(name: string) {
  return !String(name || "").trim() || JUNK_TEAM.test(String(name).trim());
}

function isRateLimited(err: unknown) {
  return /0401038|人数过多|too many/i.test(err instanceof Error ? err.message : String(err));
}

function isAuthFail(err: unknown) {
  return /0401013|token|未登录|login/i.test(err instanceof Error ? err.message : String(err));
}

function gatewayOrigin(session: SportObSessionLocal): string {
  const raw = session.gateway as unknown;
  const g = (Array.isArray(raw)
    ? String(raw.find(item => String(item || "").trim()) || "")
    : String(raw || "")
  ).trim().replace(/\/$/, "");
  if (!g)
    return PANDA_SPORT_TRIAL_GATEWAY;
  try {
    return new URL(g).origin;
  }
  catch {
    return g.startsWith("http") ? g : `https://${g}`;
  }
}

function buildEnHeaders(session: SportObSessionLocal): Record<string, string> {
  const token = String(session.token || "");
  const ts = Date.now();
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    lang: "en",
    requestId: token,
    checkId: `pc-${uuidNoDash()}-0-${ts}`,
    "request-code": "{\"panda-bss-source\":\"2\"}",
  };
}

function namesFromRow(row: Record<string, unknown>): ObEnglishTeamNames | null {
  const home = String(row.mhn ?? "").trim();
  const away = String(row.man ?? "").trim();
  if (!home || !away || isJunkTeam(home) || isJunkTeam(away))
    return null;
  return {
    home,
    away,
    league: String(row.tnjc || row.tn || "").trim(),
  };
}

function takeNames(row: unknown, out: Map<string, ObEnglishTeamNames>) {
  if (!row || typeof row !== "object" || Array.isArray(row))
    return;
  const rec = row as Record<string, unknown>;
  const mid = String(rec.mid ?? "").trim();
  if (!isC8Mid(mid) || out.has(mid))
    return;
  const names = namesFromRow(rec);
  if (names)
    out.set(mid, names);
}

const SKIP_WALK = /^(hps|cos|playData|ol|hl|mhlu|malu|frmhn)/i;

/** 英文赔率包：同一 mid 的 mhn/man 为英文队名，无并列英文字段。 */
export function collectObEnglishNames(decoded: unknown): Map<string, ObEnglishTeamNames> {
  const out = new Map<string, ObEnglishTeamNames>();
  const walk = (node: unknown, depth: number) => {
    if (!node || depth > 6)
      return;
    if (Array.isArray(node)) {
      for (const item of node)
        walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object")
      return;
    takeNames(node, out);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_WALK.test(key) || !(value && typeof value === "object"))
        continue;
      walk(value, depth + 1);
    }
  };
  walk(decoded, 0);
  return out;
}

export function peekObEnglishNames(mid: string): ObEnglishTeamNames | null {
  const id = String(mid || "").trim();
  if (!id)
    return null;
  return cache.get(id) || null;
}

export function rememberObEnglishNames(
  rows: Map<string, ObEnglishTeamNames>,
  keepMids?: Iterable<string>,
) {
  for (const [mid, names] of rows) {
    const id = String(mid || "").trim();
    if (!isC8Mid(id) || !names.home || !names.away)
      continue;
    cache.set(id, names);
  }
  if (!keepMids)
    return;
  const keep = new Set([...keepMids].map(mid => String(mid || "").trim()).filter(Boolean));
  for (const key of [...cache.keys()]) {
    if (!keep.has(key))
      cache.delete(key);
  }
}

export function resetObEnglishNamesForTests() {
  cache.clear();
  enSession = null;
  enSessionAt = 0;
}

async function assertEnvelope(envelope: unknown, apiPath: string): Promise<unknown> {
  const row = envelope && typeof envelope === "object" ? envelope as Record<string, unknown> : {};
  const code = row.code;
  if (code != null && String(code) !== "0" && String(code) !== "0000000") {
    const msg = String(row.msg || row.message || code);
    throw new Error(`OB sport ${apiPath} code=${code} ${msg}`);
  }
  const decoded = await decodeObSportPbPayload(envelope);
  if (decoded == null)
    throw new Error(`OB sport ${apiPath} decode failed`);
  return decoded;
}

async function postEnOdds(session: SportObSessionLocal, mids: string[], euid: string) {
  const origin = gatewayOrigin(session);
  const url = `${origin}${LIST_ODDS_PATH}?t=${Date.now()}`;
  const res = await a8Axios.post(url, {
    cuid: "0",
    euid,
    mids: mids.join(","),
  }, {
    headers: buildEnHeaders(session),
    timeout: 30_000,
  });
  if (res.status >= 400) {
    const text = responseBodyText(res.data);
    throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
  }
  return assertEnvelope(res.data, LIST_ODDS_PATH);
}

async function loadEnglishSession(force = false): Promise<SportObSessionLocal | null> {
  if (!force && enSession?.token && Date.now() - enSessionAt < EN_SESSION_TTL_MS)
    return enSession;
  const row = await fetchPandaSportTrialRow("en");
  const parsed = parseSportObSessionInput(formatPandaSportTrialPaste(row));
  if (!parsed.ok)
    return null;
  enSession = parsed.session;
  enSessionAt = Date.now();
  return enSession;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size)
    out.push(list.slice(i, i + size));
  return out;
}

async function fetchEnglishOddsNames(
  session: SportObSessionLocal,
  mids: string[],
): Promise<Map<string, ObEnglishTeamNames>> {
  const out = new Map<string, ObEnglishTeamNames>();
  const queue = chunk(mids, ODDS_BATCH);
  let rateHits = 0;
  let retriedPart = false;
  while (queue.length) {
    const part = queue.shift()!;
    try {
      const decoded = await postEnOdds(session, part, EUID_FOOTBALL);
      for (const [mid, names] of collectObEnglishNames(decoded))
        out.set(mid, names);
      const missing = part.filter(mid => !out.has(mid));
      if (missing.length) {
        const live = await postEnOdds(session, missing, EUID_FOOTBALL_LIVE);
        for (const [mid, names] of collectObEnglishNames(live))
          out.set(mid, names);
      }
      retriedPart = false;
    }
    catch (err) {
      if (isAuthFail(err))
        throw err;
      if (isRateLimited(err)) {
        rateHits += 1;
        if (!retriedPart && rateHits < MAX_RATE_LIMIT_HITS) {
          retriedPart = true;
          await sleep(RATE_LIMIT_SLEEP_MS);
          queue.unshift(part);
          continue;
        }
        console.warn("[football] OB English names rate-limited", part.length);
        break;
      }
      retriedPart = false;
    }
    if (queue.length)
      await sleep(BATCH_GAP_MS);
  }
  return out;
}

/** 按板上 mid 补英文队名。失败不抛；禁止把英文 token 写入中文 sport session。 */
export async function refreshObEnglishNamesForMids(mids: string[]): Promise<void> {
  const want = [...new Set(mids.map(mid => String(mid || "").trim()).filter(isC8Mid))];
  if (!want.length)
    return;
  const missing = want.filter(mid => !cache.has(mid));
  if (!missing.length) {
    rememberObEnglishNames(new Map(), want);
    return;
  }
  try {
    let session = await loadEnglishSession();
    if (!session?.token) {
      rememberObEnglishNames(new Map(), want);
      return;
    }
    let collected: Map<string, ObEnglishTeamNames>;
    try {
      collected = await fetchEnglishOddsNames(session, missing);
    }
    catch (err) {
      if (!isAuthFail(err))
        throw err;
      enSession = null;
      enSessionAt = 0;
      session = await loadEnglishSession(true);
      if (!session?.token)
        return;
      collected = await fetchEnglishOddsNames(session, missing);
    }
    rememberObEnglishNames(collected, want);
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[football] OB English names skipped", msg);
    rememberObEnglishNames(new Map(), want);
  }
}
