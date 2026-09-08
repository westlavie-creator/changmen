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

function hasObSource(m: ClientMatchDto): boolean {
  return Boolean(String((m.Matchs as Record<string, unknown> | undefined)?.OB || "").trim());
}

function overlayMatch(hit: ClientMatchDto, row: ClientMatchDto) {
  const fromOb = hasObSource(row);
  hit.Matchs = { ...(hit.Matchs || {}), ...(row.Matchs || {}) };
  if (fromOb) {
    const title = String(row.Title || "").trim();
    if (title)
      hit.Title = title;
    const kickoff = Number(row.StartTime) || 0;
    if (kickoff > 0)
      hit.StartTime = kickoff;
    const game = String(row.Game || "").trim();
    if (game)
      hit.Game = game;
  }
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
 * VPS 的 PM/PF 列表 + 本机 OB 列表（浏览器 overlay）。
 * 定案：ARB_MULTI_SPORT §3c — 不写 RDS / client_matches / sport_merge / 电竞 matcher。
 * 过渡键：标题+小时（猜测合场，只读）。目标键：联赛码 + 队名归一 + 时间窗 + 朝向；合不上并列。
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
    if (!hasObSource(hit))
      hit.Game = pickBetterFootballGame(hit.Game, row.Game);

  }
  out.sort((a, b) => {
    const ta = Number(a.StartTime) || 0;
    const tb = Number(b.StartTime) || 0;
    if (ta !== tb)
      return ta - tb;
    return (Number(a.ID) || 0) - (Number(b.ID) || 0);
  });
  return out;
}
