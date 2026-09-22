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

export function recordSingleLeg9999MapFill(matchId: number, round: number): number {
  ensureLoaded();
  const key = singleLeg9999MapKey(matchId, round);
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  writeStored();
  return next;
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
