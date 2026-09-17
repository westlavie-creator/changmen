/**
 * OB 英文队名：主会话 lang=en 拉赛程/赔率后写入内存，供 POD 对场。
 * 不再单独 tryPlay；中文旁路见 obSportChineseNames。
 */
import { shallowRef } from "vue";

export type ObEnglishTeamNames = {
  home: string;
  away: string;
  league: string;
};

const cache = new Map<string, ObEnglishTeamNames>();
export const obEnglishNamesRev = shallowRef(0);

function isC8Mid(mid: string): boolean {
  return /^\d{4,12}$/.test(String(mid || "").trim());
}

const JUNK_TEAM = /^(大|小|大球|小球|over|under|o\/u|主队|客队|home|away)$/i;

function isJunkTeam(name: string) {
  return !String(name || "").trim() || JUNK_TEAM.test(String(name).trim());
}

/** 兼容旧测试：从赔率包收集英文 mhn/man（主会话已是 en 时同源）。 */
export function collectObEnglishNames(decoded: unknown): Map<string, ObEnglishTeamNames> {
  const out = new Map<string, ObEnglishTeamNames>();
  const SKIP_WALK = /^(hps|cos|playData|ol|hl|mhlu|malu|frmhn)/i;
  const take = (row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      return;
    const rec = row as Record<string, unknown>;
    const mid = String(rec.mid ?? "").trim();
    if (!isC8Mid(mid) || out.has(mid))
      return;
    const home = String(rec.mhn ?? "").trim();
    const away = String(rec.man ?? "").trim();
    if (!home || !away || isJunkTeam(home) || isJunkTeam(away))
      return;
    out.set(mid, {
      home,
      away,
      league: String(rec.tnjc || rec.tn || "").trim(),
    });
  };
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
    take(node);
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
  let changed = false;
  for (const [mid, names] of rows) {
    const id = String(mid || "").trim();
    if (!isC8Mid(id) || !names.home || !names.away)
      continue;
    const prev = cache.get(id);
    if (!prev || prev.home !== names.home || prev.away !== names.away || prev.league !== names.league)
      changed = true;
    cache.set(id, names);
  }
  if (keepMids) {
    const keep = new Set([...keepMids].map(mid => String(mid || "").trim()).filter(Boolean));
    for (const key of [...cache.keys()]) {
      if (!keep.has(key)) {
        cache.delete(key);
        changed = true;
      }
    }
  }
  if (changed)
    obEnglishNamesRev.value += 1;
}

export function resetObEnglishNamesForTests() {
  cache.clear();
  obEnglishNamesRev.value = 0;
}

/** @deprecated 主会话已是 en，无需旁路；保留空实现以免旧调用炸。 */
export async function refreshObEnglishNamesForMids(_mids: string[]): Promise<void> {
  /* no-op */
}
