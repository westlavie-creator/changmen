/**
 * POD 跟单 EV 记录。对上 OB 且价够才落本机，过期不删。不进 USERCONFIG / fo。
 */
import { formatPodAgo, formatPodPrice } from "@/runtime/podAlerts";
import type { PodBetTicket } from "@/runtime/podBetTicket";
import type { PodObQuoteCompare, PodMarketMatch, PodMarketSide } from "@/runtime/podMarketMatch";
import type { PodFixtureMatch } from "@/runtime/podFixtureMatch";

export const POD_FOLLOW_LOG_KEY = "changmen:podFollowLog";
export const POD_FOLLOW_LOG_MAX = 200;

export type PodFollowLiveTicket = PodBetTicket & {
  fixtureMatch: Pick<PodFixtureMatch, "status"> & {
    hits?: Array<{ fixture?: { obMid?: string } }>;
  };
  marketMatch: Pick<PodMarketMatch, "status" | "oid" | "marketCode" | "boardLine" | "boardSide">;
  obQuote: PodObQuoteCompare;
};

export type PodFollowLogRow = {
  id: string;
  at: number;
  home: string;
  away: string;
  league: string;
  sideLabel: string;
  marketLabel: string;
  nvp: number;
  minObOdds: number;
  obQuote: number;
  dropPct: number;
  stake: number;
  oid: string;
  obMid: string;
  marketCode: string;
  boardSide: PodMarketSide | null;
  boardLine: number | null;
  placed: boolean;
  placedAt: number;
  placeNote: string;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(v: unknown): number | null {
  if (v == null || v === "")
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ticketHasPodFollowEv(ticket: Pick<PodFollowLiveTicket, "fixtureMatch" | "marketMatch" | "obQuote">): boolean {
  return ticket.fixtureMatch.status === "matched"
    && ticket.marketMatch.status === "matched"
    && ticket.obQuote.status === "ok";
}

export function parsePodFollowLogRow(raw: unknown): PodFollowLogRow | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const id = str(row.id);
  if (!id)
    return null;
  const side = str(row.boardSide);
  const boardSide = side === "over" || side === "under" || side === "home" || side === "away" || side === "draw"
    ? side
    : null;
  return {
    id,
    at: num(row.at),
    home: str(row.home),
    away: str(row.away),
    league: str(row.league),
    sideLabel: str(row.sideLabel),
    marketLabel: str(row.marketLabel),
    nvp: num(row.nvp),
    minObOdds: num(row.minObOdds),
    obQuote: num(row.obQuote),
    dropPct: num(row.dropPct),
    stake: num(row.stake),
    oid: str(row.oid),
    obMid: str(row.obMid),
    marketCode: str(row.marketCode),
    boardSide,
    boardLine: optNum(row.boardLine),
    placed: row.placed === true,
    placedAt: num(row.placedAt),
    placeNote: str(row.placeNote),
  };
}

export function parsePodFollowLog(raw: unknown): PodFollowLogRow[] {
  const list = Array.isArray(raw) ? raw : asRecord(raw)?.rows;
  if (!Array.isArray(list))
    return [];
  const out: PodFollowLogRow[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const row = parsePodFollowLogRow(item);
    if (!row || seen.has(row.id))
      continue;
    seen.add(row.id);
    out.push(row);
  }
  out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return out.slice(0, POD_FOLLOW_LOG_MAX);
}

export function buildPodFollowLogRow(ticket: PodFollowLiveTicket, now = Date.now()): PodFollowLogRow {
  const hit = ticket.fixtureMatch.status === "matched" ? ticket.fixtureMatch.hits?.[0] : null;
  return {
    id: ticket.id,
    at: now,
    home: ticket.alert.home,
    away: ticket.alert.away,
    league: ticket.alert.league,
    sideLabel: ticket.sideLabel,
    marketLabel: ticket.marketLabel,
    nvp: ticket.nvp,
    minObOdds: ticket.minObOdds,
    obQuote: Number(ticket.obQuote.quote) || 0,
    dropPct: ticket.dropPct,
    stake: ticket.stake,
    oid: String(ticket.marketMatch.oid || "").trim(),
    obMid: String(hit?.fixture?.obMid || "").trim(),
    marketCode: String(ticket.marketMatch.marketCode || "").trim(),
    boardSide: ticket.marketMatch.boardSide ?? null,
    boardLine: ticket.marketMatch.boardLine ?? null,
    placed: false,
    placedAt: 0,
    placeNote: "",
  };
}

function writeLog(rows: PodFollowLogRow[]): PodFollowLogRow[] {
  const next = parsePodFollowLog(rows);
  try {
    localStorage.setItem(POD_FOLLOW_LOG_KEY, JSON.stringify(next));
  }
  catch { /* quota */ }
  return next;
}

export function readPodFollowLog(): PodFollowLogRow[] {
  try {
    const raw = localStorage.getItem(POD_FOLLOW_LOG_KEY);
    if (!raw)
      return [];
    return parsePodFollowLog(JSON.parse(raw));
  }
  catch {
    return [];
  }
}

export function upsertPodFollowEv(row: PodFollowLogRow): { rows: PodFollowLogRow[]; added: boolean } {
  const parsed = parsePodFollowLogRow(row);
  if (!parsed)
    return { rows: readPodFollowLog(), added: false };
  const rows = readPodFollowLog();
  if (rows.some(item => item.id === parsed.id))
    return { rows, added: false };
  return { rows: writeLog([parsed, ...rows]), added: true };
}

export function markPodFollowLogPlaced(id: string, note: string, now = Date.now()): PodFollowLogRow[] {
  const want = String(id || "").trim();
  if (!want)
    return readPodFollowLog();
  const rows = readPodFollowLog();
  let hit = false;
  const next = rows.map((row) => {
    if (row.id !== want)
      return row;
    hit = true;
    return {
      ...row,
      placed: true,
      placedAt: row.placedAt || now,
      placeNote: String(note || "").trim() || row.placeNote,
    };
  });
  return hit ? writeLog(next) : rows;
}

export function clearPodFollowLog(): PodFollowLogRow[] {
  return writeLog([]);
}

export function formatPodFollowLogWhen(at: number, now = Date.now()): string {
  return formatPodAgo(at, now);
}

export function formatPodFollowLogQuote(row: Pick<PodFollowLogRow, "obQuote" | "minObOdds">): string {
  return `OB ${formatPodPrice(row.obQuote)} ≥ ${formatPodPrice(row.minObOdds)}`;
}

export function formatPodFollowLogPlace(row: Pick<PodFollowLogRow, "placed" | "placeNote">): string {
  if (row.placed)
    return row.placeNote || "已下";
  return "只记录";
}
