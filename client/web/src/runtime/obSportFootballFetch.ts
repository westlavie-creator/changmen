/**
 * 用户本机经 Chrome 扩展拉九游/OB 足球 HTTP。不经 VPS，不写电竞 client_matches。
 */
import type { ClientMatchDto } from "@/types/esport";
import { a8PluginPost, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { decodeObSportPbPayload } from "@/runtime/obSportCodec";
import { resolveObFootballGame } from "@/runtime/footballLeague";
import {
  dedupeObPlaySelectionRows,
  extractObPlaySelections,
  isObAhOuMarket,
  listBetsFromObPlayData,
  OB_AHOU_HPIDS,
  OB_FOOTBALL_ID_BASE,
  playsFromObMatchRow,
} from "@/runtime/obSportOdds";
import {
  matchInUpcomingWindow,
} from "@/runtime/sportBoardFilter";
import { isObSportC8Mid } from "@/runtime/obSportWs";
import { readLocalSportObSession, type SportObSessionLocal } from "@/runtime/obSportSessionLocal";

const PLUGIN_REQUIRED = "足球 OB 需要「じらいや」扩展代发（同一 Chrome 不必打开九游）";
const CACHE_TTL_MS = 120_000;
const ODDS_BATCH = 12;
const BATCH_GAP_MS = 400;
const RATE_LIMIT_SLEEP_MS = 2_000;
const MAX_RATE_LIMIT_HITS = 5;
const CSID_FOOTBALL = "1";
/** 今日/早盘足球（试玩菜单 1012 → p=3020101） */
const EUID_FOOTBALL = "3020101";
/** 滚球足球（试玩菜单 1011 → p=30002） */
const EUID_FOOTBALL_LIVE = "30002";
const SCHEDULE_PATH = "/yewu11/v2/w/structureTournamentMatchesPB";
const LIST_ODDS_PATH = "/yewu11/v1/w/structureMatchBaseInfoByMidsPB";
const DETAIL_ODDS_PATH = "/yewu11/v1/w/getMatchBaseInfoByOddsPB";

type ClientMarketRow = {
  hpid?: string;
  Name?: string;
  MarketCode?: string;
  Line?: number | null;
  Period?: string;
  Selections?: Array<{ Name?: string; Odds?: number; Side?: string; OddID?: string }>;
};

let memCache: { at: number; rows: ClientMatchDto[] } | null = null;
let inflight: Promise<ClientMatchDto[]> | null = null;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stableObMatchId(mid: string): number {
  let h = 2166136261;
  for (let i = 0; i < mid.length; i++) {
    h ^= mid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return OB_FOOTBALL_ID_BASE + ((h >>> 0) % 9_000_000);
}

function uuidNoDash() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, "");
}

function sportCuid(session: SportObSessionLocal) {
  const digits = String(session.sessionId || session.uid || "").replace(/\D/g, "");
  if (digits.length >= 18)
    return digits.slice(0, 18);
  return digits || "0";
}

function gatewayOrigin(session: SportObSessionLocal): string {
  const raw = session.gateway as unknown;
  const g = (Array.isArray(raw)
    ? String(raw.find(item => String(item || "").trim()) || "")
    : String(raw || "")
  ).trim().replace(/\/$/, "");
  if (!g)
    return "";
  try {
    return new URL(g).origin;
  }
  catch {
    return g.startsWith("http") ? g : `https://${g}`;
  }
}

function buildHeaders(session: SportObSessionLocal): Record<string, string> {
  const token = String(session.token || "");
  const cuid = sportCuid(session);
  const ts = Date.now();
  const referer = String(session.referer || "").trim() || "https://user-pc-new.example.com/";
  let origin = "";
  try {
    origin = new URL(referer).origin;
  }
  catch {
    origin = "";
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    lang: "zh",
    requestId: token,
    checkId: `pc-${uuidNoDash()}-${cuid}-${ts}`,
    "request-code": "{\"panda-bss-source\":\"2\"}",
    Referer: referer,
    ...(origin ? { Origin: origin } : {}),
  };
}

function unwrapPluginBody(raw: unknown): unknown {
  if (raw == null)
    throw new Error("扩展无响应");
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    }
    catch {
      throw new Error("OB sport HTTP non-json");
    }
  }
  const row = raw as Record<string, unknown>;
  if (row.isAxiosError || row.name === "AxiosError" || row.code === "ERR_NETWORK")
    throw new Error(String(row.message || "OB HTTP failed"));
  if ("data" in row && ("status" in row || "headers" in row || "config" in row))
    return row.data;
  return raw;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** livedata 可能是数组，也可能是 tid→联赛 的对象。 */
function bagRows(value: unknown): unknown[] {
  if (Array.isArray(value))
    return value;
  if (value && typeof value === "object") {
    const vals = Object.values(value as Record<string, unknown>);
    if (vals.some(v => v && typeof v === "object" && (
      "mids" in (v as object)
      || "mid" in (v as object)
      || "tid" in (v as object)
      || "csid" in (v as object)
    )))
      return vals;
  }
  return [];
}

function unwrapData(decoded: unknown): Record<string, unknown> {
  if (Array.isArray(decoded))
    return decoded as unknown as Record<string, unknown>;
  if (!decoded || typeof decoded !== "object")
    return {};
  const row = decoded as Record<string, unknown>;
  if (row.data && typeof row.data === "object")
    return row.data as Record<string, unknown>;
  return row;
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

async function postPb(session: SportObSessionLocal, apiPath: string, body: Record<string, unknown>) {
  if (!hasA8PluginRuntime())
    throw new Error(PLUGIN_REQUIRED);
  const origin = gatewayOrigin(session);
  if (!origin)
    throw new Error("sport OB session missing gateway");
  const url = `${origin}${apiPath}${apiPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const raw = await a8PluginPost(url, body ?? {}, {
    headers: buildHeaders(session),
    timeout: 30_000,
  });
  return assertEnvelope(unwrapPluginBody(raw), apiPath);
}

export type ScheduleMeta = {
  mid: string;
  tid: string;
  tn: string;
  tnjc: string;
  startTime: number;
  home?: string;
  away?: string;
  isLive?: boolean;
};

export function collectObFootballSchedule(decoded: unknown, forceLive = false): ScheduleMeta[] {
  return collectFootballMatches(decoded, forceLive);
}

function collectFootballMatches(decoded: unknown, forceLive = false): ScheduleMeta[] {
  const root = unwrapData(decoded);
  const bags: Array<{ rows: unknown[]; live: boolean }> = [
    { rows: bagRows(root.livedata), live: true },
    { rows: bagRows(root.nolivedata), live: false },
    { rows: bagRows(root.data), live: forceLive },
    { rows: bagRows(root.list), live: forceLive },
    { rows: asArray(root), live: forceLive },
  ];
  const byMid = new Map<string, ScheduleMeta>();
  const put = (row: ScheduleMeta) => {
    const prev = byMid.get(row.mid);
    if (!prev) {
      byMid.set(row.mid, row);
      return;
    }
    byMid.set(row.mid, { ...prev, ...row, isLive: Boolean(prev.isLive || row.isLive) });
  };
  for (const bag of bags) {
    for (const tour of bag.rows) {
      if (!tour || typeof tour !== "object")
        continue;
      const t = tour as Record<string, unknown>;
      const csid = String(t.csid ?? t.sportId ?? t.sid ?? "");
      const midsRaw = t.mids ?? t.mid;
      const tid = String(t.tid ?? t.tournamentId ?? t.id ?? "");
      const tn = String(t.tn ?? t.nameText ?? t.n ?? "");
      const tnjc = String(t.tnjc ?? t.shortName ?? "");
      const mgt = t.mgt ?? t.startTime ?? t.mgtStr;
      const midList = Array.isArray(midsRaw)
        ? midsRaw.map(String)
        : String(midsRaw || "").split(",").map(s => s.trim()).filter(Boolean);
      if (csid && csid !== CSID_FOOTBALL)
        continue;
      for (const mid of midList) {
        if (!isObSportC8Mid(mid))
          continue;
        put({ mid, tid, tn, tnjc, startTime: Number(mgt) || 0, isLive: bag.live });
      }
      const nested = asArray(t.mls || t.matches || t.ms);
      for (const m of nested) {
        if (!m || typeof m !== "object")
          continue;
        const row = m as Record<string, unknown>;
        const mid = String(row.mid ?? row.id ?? "");
        if (!isObSportC8Mid(mid))
          continue;
        const mCsid = String(row.csid ?? csid);
        if (mCsid && mCsid !== CSID_FOOTBALL)
          continue;
        put({
          mid,
          tid: String(row.tid ?? tid),
          tn: String(row.tn ?? tn),
          tnjc: String(row.tnjc ?? tnjc),
          startTime: Number(row.mgt ?? row.mgtStr ?? row.startTime ?? mgt) || 0,
          home: String(row.mhn ?? row.home ?? ""),
          away: String(row.man ?? row.away ?? ""),
          isLive: bag.live,
        });
      }
    }
  }
  return [...byMid.values()];
}

function startTimeMs(raw: unknown): number {
  const n = Number(raw) || 0;
  if (n <= 0)
    return 0;
  return n > 1e12 ? n : n * 1000;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size)
    out.push(list.slice(i, i + size));
  return out;
}

function isRateLimited(err: unknown) {
  return /0401038|人数过多|too many/i.test(err instanceof Error ? err.message : String(err));
}

function ingestOddsRows(decoded: unknown, byMid: Map<string, Record<string, unknown>>) {
  const root = unwrapData(decoded);
  const rows = asArray(root.data).length ? asArray(root.data) : asArray(root);
  for (const row of rows) {
    if (!row || typeof row !== "object")
      continue;
    const mid = String((row as { mid?: unknown; id?: unknown }).mid ?? (row as { id?: unknown }).id ?? "");
    if (mid)
      byMid.set(mid, row as Record<string, unknown>);
  }
}

async function fetchOddsByMids(
  session: SportObSessionLocal,
  mids: string[],
  euid = EUID_FOOTBALL,
) {
  const byMid = new Map<string, Record<string, unknown>>();
  const queue = chunk(mids, ODDS_BATCH);
  let rateHits = 0;
  let failN = 0;
  while (queue.length) {
    const part = queue.shift()!;
    try {
      const decoded = await postPb(session, LIST_ODDS_PATH, {
        cuid: sportCuid(session),
        euid,
        mids: part.join(","),
      });
      ingestOddsRows(decoded, byMid);
    }
    catch (err) {
      failN += 1;
      if (isRateLimited(err)) {
        rateHits += 1;
        if (rateHits >= MAX_RATE_LIMIT_HITS)
          break;
        await sleep(RATE_LIMIT_SLEEP_MS);
        if (part.length > 4) {
          const mid = Math.ceil(part.length / 2);
          queue.unshift(part.slice(mid), part.slice(0, mid));
        }
        else {
          queue.unshift(part);
        }
        continue;
      }
    }
    if (queue.length)
      await sleep(BATCH_GAP_MS);
  }
  void failN;
  return byMid;
}

function matchRowFromDecoded(decoded: unknown): Record<string, unknown> | null {
  const envelope = decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded as Record<string, unknown>
    : {};
  const row = (asArray(envelope.data)[0] as Record<string, unknown> | undefined)
    || (envelope.mid ? envelope : null)
    || (Array.isArray(decoded) ? decoded[0] as Record<string, unknown> : null);
  if (row && Array.isArray(envelope.playData) && envelope.playData.length)
    row.playData = envelope.playData;
  return row || null;
}

function isOutcomeLabel(name: string) {
  return /^(大|小|大球|小球|over|under|o\/u)$/i.test(String(name || "").trim());
}

function displayBetName(marketCode: string, line: number | null | undefined) {
  const raw = String(marketCode || "").toLowerCase();
  const ht = raw.startsWith("ht_");
  const code = ht ? raw.slice(3) : raw;
  const prefix = ht ? "半场" : "";
  if (code === "spreads") {
    const n = Number(line);
    if (!Number.isFinite(n))
      return `${prefix}让球`;
    return `${prefix}让球 ${n > 0 ? `+${n}` : String(n)}`;
  }
  if (code === "totals") {
    const n = Number(line);
    return Number.isFinite(n) ? `${prefix}大小 ${n}` : `${prefix}大小球`;
  }
  return ht ? "半场胜负" : "全场胜负";
}

function isFootballListMarket(code: string, hpid?: string) {
  return isObAhOuMarket(hpid, code);
}

function obListGame(tid: string, tn: string, tnjc: string): string {
  const official = String(tnjc || tn || "").trim();
  return official || resolveObFootballGame(tid, tn, tnjc);
}

function buildDto(meta: ScheduleMeta, oddsRow: Record<string, unknown> | null | undefined): ClientMatchDto | null {
  const row = oddsRow && typeof oddsRow === "object" ? oddsRow : {};
  const mid = String(meta.mid);
  const matchId = stableObMatchId(mid);
  let home = String(row.mhn || meta.home || "").trim();
  let away = String(row.man || meta.away || "").trim();
  if (isOutcomeLabel(home) || isOutcomeLabel(away)) {
    home = String(meta.home || "").trim();
    away = String(meta.away || "").trim();
  }
  if (!home || !away || isOutcomeLabel(home) || isOutcomeLabel(away))
    return null;
  const tid = String(row.tid || meta.tid || "");
  const tn = String(row.tn || meta.tn || "");
  const tnjc = String(row.tnjc || meta.tnjc || "");
  const game = obListGame(tid, tn, tnjc);
  const startTime = startTimeMs(row.mgt || row.mgtStr || meta.startTime);
  const playData = playsFromObMatchRow(row);
  const listBets = listBetsFromObPlayData(playData);
  const bets: NonNullable<ClientMatchDto["Bets"]> = [];
  let seq = 0;
  const seen = new Set<string>();
  for (const b of listBets) {
    const marketCode = String(b.marketCode || "moneyline");
    if (!isFootballListMarket(marketCode, b.hpid))
      continue;
    const uniq = `${marketCode}|${b.line == null ? "" : String(b.line)}`;
    if (seen.has(uniq))
      continue;
    seen.add(uniq);
    seq += 1;
    const betId = matchId * 100 + seq;
    const isTotals = marketCode === "totals" || marketCode === "ht_totals";
    const title = String(b.name || "").trim();
    const name = title && !/^(moneyline|spreads|totals|ob:)/i.test(title)
      ? title
      : displayBetName(marketCode, b.line);
    const src: Record<string, unknown> = {
      Type: "OB",
      BetID: String(b.homeOid || `${mid}-${marketCode}-${seq}`),
      HomeID: String(b.homeOid || `${mid}-h-${seq}`),
      AwayID: String(b.awayOid || `${mid}-a-${seq}`),
      HomeOdds: b.homeOdds,
      AwayOdds: b.awayOdds,
      Status: (b.homeOdds > 0 && b.awayOdds > 0) ? "Normal" : "Locked",
    };
    if (b.drawOdds > 0)
      src.DrawOdds = b.drawOdds;
    if (b.drawOid)
      src.DrawID = b.drawOid;
    bets.push({
      ID: betId,
      MatchID: matchId,
      Map: 0,
      Name: name,
      MarketCode: marketCode,
      Line: b.line,
      HomeID: betId * 10 + 1,
      HomeName: isTotals ? "大" : home,
      AwayID: betId * 10 + 2,
      AwayName: isTotals ? "小" : away,
      Sources: { OB: src as unknown as ClientMatchDto["Bets"][number]["Sources"][string] },
    } as ClientMatchDto["Bets"][number]);
  }
  return {
    ID: matchId,
    Title: `${home} vs ${away}`,
    Game: game,
    GameID: 0,
    StartTime: startTime || Date.now(),
    Matchs: { OB: mid },
    Bets: bets,
  } as ClientMatchDto;
}

/** 列表 DTO：有队名就出牌，缺让球/大小时 Bets 为空。 */
export function buildObFootballListDto(
  meta: ScheduleMeta,
  oddsRow?: Record<string, unknown> | null,
): ClientMatchDto | null {
  return buildDto(meta, oddsRow);
}

function mergeMarketRows(lists: ClientMarketRow[][]): ClientMarketRow[] {
  const out: ClientMarketRow[] = [];
  const seen = new Set<string>();
  for (const r of lists.flat()) {
    const oidKey = (r.Selections || []).map(s => s.OddID || s.Name).join(",");
    const key = `${r.hpid}|${r.MarketCode}|${r.Line}|${r.Name}|${oidKey}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function marketsFromRow(_mid: string, row: Record<string, unknown> | null): ClientMarketRow[] {
  if (!row)
    return [];
  const extracted = dedupeObPlaySelectionRows(
    playsFromObMatchRow(row).flatMap(p => extractObPlaySelections(p)),
  ).filter(r => r.selections.length && isObAhOuMarket(r.hpid, r.marketCode));
  return mergeMarketRows([
    extracted.map(r => ({
      hpid: r.hpid,
      MarketCode: r.marketCode,
      Name: r.name,
      Line: r.line,
      Period: r.period,
      Selections: r.selections.map(s => ({
        Side: s.side,
        Name: s.name,
        Odds: s.odds,
        OddID: s.oid,
      })),
    })),
  ]);
}

async function fetchSchedule(session: SportObSessionLocal, euid: string, liveMenu = false): Promise<ScheduleMeta[]> {
  const decoded = await postPb(session, SCHEDULE_PATH, {
    cuid: sportCuid(session),
    sort: 1,
    tid: "",
    apiType: 1,
    orpt: 0,
    euid,
  });
  return collectFootballMatches(decoded, liveMenu).map(row => (
    liveMenu ? { ...row, isLive: true } : row
  ));
}

function mergeSchedule(parts: ScheduleMeta[][]): ScheduleMeta[] {
  const byMid = new Map<string, ScheduleMeta>();
  for (const rows of parts) {
    for (const row of rows) {
      const prev = byMid.get(row.mid);
      if (!prev) {
        byMid.set(row.mid, row);
        continue;
      }
      byMid.set(row.mid, { ...prev, ...row, isLive: Boolean(prev.isLive || row.isLive) });
    }
  }
  return [...byMid.values()];
}

async function doFetch(): Promise<ClientMatchDto[]> {
  const session = readLocalSportObSession();
  if (!session?.token)
    return [];
  if (!gatewayOrigin(session))
    throw new Error("体育 OB 无网关：粘贴里需要 api 网关，否则扩展无法代发");
  if (!hasA8PluginRuntime())
    throw new Error(PLUGIN_REQUIRED);
  const [today, inplay] = await Promise.all([
    fetchSchedule(session, EUID_FOOTBALL, false),
    fetchSchedule(session, EUID_FOOTBALL_LIVE, true).catch(() => [] as ScheduleMeta[]),
  ]);
  const schedule = mergeSchedule([today, inplay]);
  if (!schedule.length)
    throw new Error("OB sport schedule empty");
  const now = Date.now();
  const windowed = schedule.filter((m) => {
    if (m.isLive)
      return true;
    const t = startTimeMs(m.startTime);
    if (!(t > 0))
      return true;
    return matchInUpcomingWindow(t, now);
  });
  const oddsMap = await fetchOddsByMids(session, windowed.map(m => m.mid).filter(Boolean));
  const missingLive = windowed
    .filter(m => m.isLive && m.mid && !oddsMap.has(m.mid))
    .map(m => m.mid);
  if (missingLive.length) {
    const extra = await fetchOddsByMids(session, missingLive, EUID_FOOTBALL_LIVE);
    for (const [mid, row] of extra)
      oddsMap.set(mid, row);
  }
  const dtos: ClientMatchDto[] = [];
  for (const meta of windowed) {
    const dto = buildDto(meta, oddsMap.get(meta.mid));
    if (!dto)
      continue;
    if (meta.isLive || matchInUpcomingWindow(Number(dto.StartTime) || 0, now))
      dtos.push(dto);
  }
  dtos.sort((a, b) => (Number(a.StartTime) || 0) - (Number(b.StartTime) || 0));
  return dtos;
}

export async function fetchObFootballAsClientMatchDtos(): Promise<ClientMatchDto[]> {
  const session = readLocalSportObSession();
  if (!session?.token)
    return [];
  const age = memCache ? Date.now() - memCache.at : Infinity;
  if (memCache?.rows.length && age < CACHE_TTL_MS)
    return memCache.rows;
  if (inflight)
    return inflight;
  inflight = doFetch().then((rows) => {
    if (rows.length)
      memCache = { at: Date.now(), rows };
    return rows.length ? rows : (memCache?.rows || []);
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

export function clearObFootballClientCache() {
  memCache = null;
  inflight = null;
}

export async function fetchObFootballMatchMarkets(mid: string): Promise<ClientMarketRow[]> {
  const session = readLocalSportObSession();
  if (!session?.token || !gatewayOrigin(session))
    return [];
  if (!hasA8PluginRuntime())
    throw new Error(PLUGIN_REQUIRED);
  const id = String(mid || "").trim();
  if (!id)
    return [];
  let detailRow: Record<string, unknown> | null = null;
  try {
    detailRow = matchRowFromDecoded(await postPb(session, DETAIL_ODDS_PATH, {
      cuid: sportCuid(session),
      cos: 0,
      orpt: 0,
      euid: EUID_FOOTBALL,
      mid: id,
      mcid: 0,
      newUser: 0,
    }));
  }
  catch {
    detailRow = null;
  }
  let rows = marketsFromRow(id, detailRow);
  try {
    const map = await fetchOddsByMids(session, [id]);
    rows = mergeMarketRows([rows, marketsFromRow(id, map.get(id) || null)]);
  }
  catch { /* list fallback optional */ }
  const have = new Set(rows.map(r => String(r.hpid || "")));
  const missing = OB_AHOU_HPIDS.filter(p => !have.has(p));
  if (missing.length) {
    try {
      const extra = matchRowFromDecoded(await postPb(session, DETAIL_ODDS_PATH, {
        cuid: sportCuid(session),
        cos: 0,
        orpt: 0,
        euid: EUID_FOOTBALL,
        mid: id,
        mcid: 0,
        newUser: 0,
        hps: missing.join(","),
      }));
      rows = mergeMarketRows([rows, marketsFromRow(id, extra)]);
    }
    catch { /* ignore */ }
  }
  return rows;
}
