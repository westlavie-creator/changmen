/**
 * [changmen 扩展] 同一比赛同一地图的 EV 下单次数（含手动确认 + 自动）。
 * localStorage：多标签共用；刷新不清零（避免刷新后再下一笔绕过同图次数）。
 */

export const VALUE_BET_MAP_COUNT_STORAGE_KEY = "ValueBetMapCount";
/** @deprecated 旧 session 键名，读取时会迁到 localStorage */
export const VALUE_BET_MAP_COUNT_SESSION_KEY = VALUE_BET_MAP_COUNT_STORAGE_KEY;

const counts = new Map<string, number>();
let loaded = false;
let listening = false;

export function valueBetMapKey(matchId: number, round: number): string {
  return `${matchId}:${round}`;
}

function storageOf(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  }
  catch {
    return null;
  }
}

function parseCountMap(raw: string | null): Map<string, number> {
  if (!raw)
    return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return new Map();
    const out = new Map<string, number>();
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (typeof k === "string" && k.includes(":") && Number.isFinite(n) && n > 0)
        out.set(k, Math.round(n));
    }
    return out;
  }
  catch {
    return new Map();
  }
}

function readStored(): Map<string, number> {
  const local = parseCountMap(storageOf("local")?.getItem(VALUE_BET_MAP_COUNT_STORAGE_KEY) ?? null);
  const session = parseCountMap(storageOf("session")?.getItem(VALUE_BET_MAP_COUNT_STORAGE_KEY) ?? null);
  const out = new Map(session);
  for (const [k, v] of local)
    out.set(k, Math.max(out.get(k) ?? 0, v));
  return out;
}

function writeStored(map: Map<string, number>): void {
  const json = JSON.stringify(Object.fromEntries(map));
  try {
    storageOf("local")?.setItem(VALUE_BET_MAP_COUNT_STORAGE_KEY, json);
  }
  catch {
    /* ignore quota / private mode */
  }
}

function mergeCounts(incoming: Map<string, number>): void {
  for (const [k, v] of incoming)
    counts.set(k, Math.max(counts.get(k) ?? 0, v));
}

function ensureListening(): void {
  if (listening || typeof window === "undefined")
    return;
  listening = true;
  window.addEventListener("storage", (ev) => {
    if (ev.key !== VALUE_BET_MAP_COUNT_STORAGE_KEY)
      return;
    mergeCounts(parseCountMap(ev.newValue));
  });
}

function ensureLoaded(): void {
  ensureListening();
  if (loaded)
    return;
  loaded = true;
  mergeCounts(readStored());
}

export function getValueBetMapCount(matchId: number, round: number): number {
  ensureLoaded();
  return counts.get(valueBetMapKey(matchId, round)) ?? 0;
}

export function recordValueBetMapFill(matchId: number, round: number): number {
  ensureLoaded();
  const key = valueBetMapKey(matchId, round);
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  writeStored(counts);
  return next;
}

export function resetValueBetMapCountForTests(): void {
  loaded = false;
  counts.clear();
  try {
    storageOf("local")?.removeItem(VALUE_BET_MAP_COUNT_STORAGE_KEY);
    storageOf("session")?.removeItem(VALUE_BET_MAP_COUNT_STORAGE_KEY);
  }
  catch {
    /* ignore */
  }
}
