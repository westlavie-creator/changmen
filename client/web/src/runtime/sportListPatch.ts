import type { ViewMatch } from "@/models/match";

/** 列表 DOM / 合场补丁键：有 OB mid 就钉死，避免 PM 合场改 ID 把卡片拆掉重挂。 */
export function sportMatchStableKey(m: {
  id?: number;
  providers?: Record<string, string | number>;
}): string {
  const ob = String(m.providers?.OB ?? "").trim();
  if (ob)
    return `ob:${ob}`;
  return `id:${Number(m.id) || 0}`;
}

function applyViewMatchPatch(old: ViewMatch, fresh: ViewMatch) {
  old.title = fresh.title;
  old.game = fresh.game;
  old.gameId = fresh.gameId;
  old.bo = fresh.bo;
  old.startAt = fresh.startAt;
  old.liveRound = fresh.liveRound;
  old.liveRoundStart = fresh.liveRoundStart;
  old.reverse = fresh.reverse;
  old.providers = fresh.providers;
  old.bets = fresh.bets;
  old.pmSport = fresh.pmSport;
}

/**
 * 轮询结果写回已有 ViewMatch，保持对象引用，Vue 按 key 复用卡片。
 */
export function patchSportViewMatches(prev: ViewMatch[], next: ViewMatch[]): ViewMatch[] {
  const oldByKey = new Map((Array.isArray(prev) ? prev : []).map(m => [sportMatchStableKey(m), m]));
  const out: ViewMatch[] = [];
  for (const fresh of Array.isArray(next) ? next : []) {
    const old = oldByKey.get(sportMatchStableKey(fresh));
    if (old) {
      applyViewMatchPatch(old, fresh);
      out.push(old);
      continue;
    }
    out.push(fresh);
  }
  return out;
}
