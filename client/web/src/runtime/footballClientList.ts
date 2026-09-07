import type { ClientMatchDto } from "@/types/esport";
import { pickBetterFootballGame } from "@/runtime/footballLeague";

function junkTitle(title: string): boolean {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  if (parts.length < 2)
    return false;
  const home = parts[0].trim();
  const away = parts.slice(1).join(" vs ").trim();
  return /^(大|小|大球|小球|over|under|o\/u)$/i.test(home)
    && /^(大|小|大球|小球|over|under|o\/u)$/i.test(away);
}

function pairKey(m: ClientMatchDto): string {
  const title = String(m.Title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const hour = Math.floor((Number(m.StartTime) || 0) / 3_600_000);
  return `${hour}|${title}`;
}

function cloneMatch(m: ClientMatchDto): ClientMatchDto {
  return {
    ...m,
    Matchs: { ...(m.Matchs || {}) },
    Bets: [...(m.Bets || [])],
  };
}

function overlayMatch(hit: ClientMatchDto, row: ClientMatchDto) {
  hit.Matchs = { ...(hit.Matchs || {}), ...(row.Matchs || {}) };
  const byBet = new Map(
    (hit.Bets || []).map(b => [`${b.MarketCode}|${b.Line ?? ""}`, b]),
  );
  for (const bet of row.Bets || []) {
    const k = `${bet.MarketCode}|${bet.Line ?? ""}`;
    const existing = byBet.get(k);
    if (existing) {
      existing.Sources = { ...(existing.Sources || {}), ...(bet.Sources || {}) };
      continue;
    }
    hit.Bets = [...(hit.Bets || []), bet];
    byBet.set(k, bet);
  }
}

/**
 * VPS 的 PM/PF 列表 + 本机 OB 列表。
 * 标题+小时相同则并成一场（含 PM 让球/大小拆成两条的情况），把 OB 源挂上。
 * 不写 RDS / client_matches。
 */
export function mergeFootballClientLists(
  pmPf: ClientMatchDto[],
  ob: ClientMatchDto[],
): ClientMatchDto[] {
  const rows = [
    ...(Array.isArray(pmPf) ? pmPf : []),
    ...(Array.isArray(ob) ? ob : []),
  ].filter(m => !junkTitle(String(m.Title || "")));
  const index = new Map<string, ClientMatchDto>();
  const out: ClientMatchDto[] = [];
  for (const row of rows) {
    const key = pairKey(row);
    const hit = index.get(key);
    if (!hit) {
      const copy = cloneMatch(row);
      out.push(copy);
      index.set(key, copy);
      continue;
    }
    overlayMatch(hit, row);
    hit.Game = pickBetterFootballGame(hit.Game, row.Game);
  }
  return out;
}
