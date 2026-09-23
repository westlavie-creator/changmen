/**
 * [changmen 扩展] 9999 单边同一比赛同一地图下注次数。
 * 独立于正 EV 同图次数，避免两套策略互相占用额度。
 */

export const SINGLE_LEG_9999_MAP_COUNT_STORAGE_KEY = "SingleLeg9999MapCount";

const counts = new Map<string, number>();
let loaded = false;
let listening = false;

export function singleLeg9999MapKey(matchId: number, round: number): string {
  return `${matchId}:${round}`;
}

export function singleLeg9999SourceMarketKey(
  provider: string,
  matchId: string,
  betId: string,
): string | null {
  const p = String(provider || "").trim();
  const m = String(matchId || "").trim();
  const b = String(betId || "").trim();
  if (!p || !m || !b)
    return null;
  return `source:${p}:${m}:${b}`;
}

function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys.map(k => String(k || "").trim()).filter(Boolean))];
}

function storage(): Storage | null {
  try {
    return localStorage;
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

function writeStored(): void {
  try {
    storage()?.setItem(SINGLE_LEG_9999_MAP_COUNT_STORAGE_KEY, JSON.stringify(Object.fromEntries(counts)));
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
    if (ev.key !== SINGLE_LEG_9999_MAP_COUNT_STORAGE_KEY)
      return;
    mergeCounts(parseCountMap(ev.newValue));
  });
}

function ensureLoaded(): void {
  ensureListening();
  if (loaded)
    return;
  loaded = true;
  mergeCounts(parseCountMap(storage()?.getItem(SINGLE_LEG_9999_MAP_COUNT_STORAGE_KEY) ?? null));
}

export function getSingleLeg9999MapCount(matchId: number, round: number): number {
  ensureLoaded();
  return counts.get(singleLeg9999MapKey(matchId, round)) ?? 0;
}

export function getSingleLeg9999MapCountForKeys(keys: string[]): number {
  ensureLoaded();
  let max = 0;
  for (const key of uniqueKeys(keys))
    max = Math.max(max, counts.get(key) ?? 0);
  return max;
}

export function recordSingleLeg9999MapFill(matchId: number, round: number): number {
  ensureLoaded();
  const key = singleLeg9999MapKey(matchId, round);
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  writeStored();
  return next;
}

export function recordSingleLeg9999MapFillKeys(keys: string[]): number {
  ensureLoaded();
  let max = 0;
  for (const key of uniqueKeys(keys)) {
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    max = Math.max(max, next);
  }
  writeStored();
  return max;
}

export function reserveSingleLeg9999MapFill(matchId: number, round: number, maxPerMap: number): boolean {
  ensureLoaded();
  const key = singleLeg9999MapKey(matchId, round);
  const current = counts.get(key) ?? 0;
  if (current >= maxPerMap)
    return false;
  counts.set(key, current + 1);
  writeStored();
  return true;
}

export function reserveSingleLeg9999MapFillKeys(keys: string[], maxPerMap: number): boolean {
  ensureLoaded();
  const uniq = uniqueKeys(keys);
  if (!uniq.length)
    return false;
  if (uniq.some(key => (counts.get(key) ?? 0) >= maxPerMap))
    return false;
  for (const key of uniq)
    counts.set(key, (counts.get(key) ?? 0) + 1);
  writeStored();
  return true;
}

export function releaseSingleLeg9999MapFill(matchId: number, round: number): number {
  ensureLoaded();
  const key = singleLeg9999MapKey(matchId, round);
  const next = Math.max(0, (counts.get(key) ?? 0) - 1);
  if (next > 0)
    counts.set(key, next);
  else counts.delete(key);
  writeStored();
  return next;
}

export function releaseSingleLeg9999MapFillKeys(keys: string[]): number {
  ensureLoaded();
  let max = 0;
  for (const key of uniqueKeys(keys)) {
    const next = Math.max(0, (counts.get(key) ?? 0) - 1);
    if (next > 0)
      counts.set(key, next);
    else counts.delete(key);
    max = Math.max(max, next);
  }
  writeStored();
  return max;
}

export function resetSingleLeg9999MapCountForTests(): void {
  loaded = false;
  counts.clear();
  try {
    storage()?.removeItem(SINGLE_LEG_9999_MAP_COUNT_STORAGE_KEY);
  }
  catch {
    /* ignore */
  }
}
