import type { FootballFollowSelectionKey } from "@/runtime/footballFollowSelectionKey";

const STORAGE_KEY = "changmen:footballFollowAttempts";
const MAX_ROWS = 200;
const DEDUPE_MS = 5_000;

export type FootballFollowAttemptStatus =
  | "manual_click"
  | "auto_attempt"
  | "blocked"
  | "placed"
  | "failed";

export type FootballFollowAttemptInput = {
  ticketId: string;
  venue: string;
  status: FootballFollowAttemptStatus;
  reason?: string;
  message?: string;
  auto?: boolean;
  odds?: number;
  stake?: number;
  selection?: FootballFollowSelectionKey | null;
  at?: number;
};

export type FootballFollowAttemptRow = FootballFollowAttemptInput & {
  id: string;
  at: number;
  selectionKey?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function safeStorage(): StorageLike | null {
  try {
    return globalThis.localStorage || null;
  }
  catch {
    return null;
  }
}

function selectionKeyText(key: FootballFollowSelectionKey | null | undefined): string | undefined {
  if (!key)
    return undefined;
  return [
    key.matchKey,
    key.venue,
    key.period,
    key.marketCode,
    key.line ?? "",
    key.side,
    key.oddId,
    key.confidence,
  ].join("|");
}

function parseRows(raw: string | null): FootballFollowAttemptRow[] {
  if (!raw)
    return [];
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows.filter(Boolean) : [];
  }
  catch {
    return [];
  }
}

export function readFootballFollowAttempts(storage: StorageLike | null = safeStorage()): FootballFollowAttemptRow[] {
  if (!storage)
    return [];
  try {
    return parseRows(storage.getItem(STORAGE_KEY));
  }
  catch {
    return [];
  }
}

function dedupeKey(row: Pick<FootballFollowAttemptRow, "ticketId" | "venue" | "status" | "reason" | "selectionKey">): string {
  return [
    row.ticketId,
    row.venue,
    row.status,
    row.reason || "",
    row.selectionKey || "",
  ].join("|");
}

export function recordFootballFollowAttempt(
  input: FootballFollowAttemptInput,
  storage: StorageLike | null = safeStorage(),
): FootballFollowAttemptRow | null {
  if (!storage)
    return null;
  try {
    const at = Number(input.at) || Date.now();
    const selectionKey = selectionKeyText(input.selection);
    const row: FootballFollowAttemptRow = {
      ...input,
      at,
      id: `${at}:${String(input.venue || "")}:${String(input.ticketId || "")}:${String(input.status || "")}`,
      venue: String(input.venue || "").trim() || "OB",
      ticketId: String(input.ticketId || "").trim(),
      ...(selectionKey ? { selectionKey } : {}),
    };
    const prev = readFootballFollowAttempts(storage);
    const key = dedupeKey(row);
    const recentDup = prev.find(item => dedupeKey(item) === key && at - Number(item.at) < DEDUPE_MS);
    if (recentDup)
      return recentDup;
    const next = [row, ...prev].slice(0, MAX_ROWS);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return row;
  }
  catch {
    return null;
  }
}
