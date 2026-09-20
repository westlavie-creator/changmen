import type { ClientMatchDto } from "@/types/esport";
import { pickBetterFootballGame } from "@/runtime/footballLeague";
import {
  footballLeagueMatch,
  footballRowIdentity,
  pairMatchTier,
  reorientFootballRow,
  type FootballRowIdentity,
  type PairMatchTier,
} from "@/runtime/footballMatchKey";

function junkTitle(title: string): boolean {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  if (parts.length < 2)
    return false;
  const home = parts[0].trim();
  const away = parts.slice(1).join(" vs ").trim();
  return /^(大|小|大球|小球|over|under|o\/u)$/i.test(home)
    && /^(大|小|大球|小球|over|under|o\/u)$/i.test(away);
}

function legacyTitle(row: ClientMatchDto): string {
  return String(row.Title || "").toLowerCase().replace(/\s+/g, " ").trim();
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
  const league = String(row.League || "").trim();
  if (league)
    hit.League = league;
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
 * 键 = 联赛码（unknown_fb 通配）+ 归一队名对（共享别名表，填充词剔除）
 *     + 开赛小时桶 + 主客朝向（flip 先行重定向再 overlay）。
 * 配对分层：canonical 全等 = 确定；token 子集 = 猜测（打 MergeGuess，禁入未来 N4）。
 * 队名不可识别（OB 占位标题）退回旧「小时|标题」键；合不上并列。
 */
export function mergeFootballClientLists(
  pmPf: ClientMatchDto[],
  ob: ClientMatchDto[],
): ClientMatchDto[] {
  const rows = [
    ...(Array.isArray(pmPf) ? pmPf : []),
    ...(Array.isArray(ob) ? ob : []),
  ].filter(m => !junkTitle(String(m.Title || "")));
  /** @type {Map<number, Array<{ row: ClientMatchDto; id: FootballRowIdentity | null; guess: boolean }>>} */
  const byHour = new Map();
  const out: ClientMatchDto[] = [];
  for (const row of rows) {
    const id = footballRowIdentity(row);
    const hour = id ? id.hour : Math.floor((Number(row.StartTime) || 0) / 3_600_000);
    const cands = byHour.get(hour) || [];
    let hit: { row: ClientMatchDto; id: FootballRowIdentity | null; guess: boolean } | null = null;
    let tier: "exact" | "guess" | null = null;
    let flip = false;
    for (const cand of cands) {
      let m: PairMatchTier = null;
      if (id && cand.id) {
        if (footballLeagueMatch(cand.id.leagueKey, id.leagueKey))
          m = pairMatchTier(cand.id, id);
      }
      else if (!id && !cand.id && legacyTitle(cand.row) === legacyTitle(row)) {
        m = { tier: "exact", flip: false };
      }
      if (!m)
        continue;
      if (!hit || (tier === "guess" && m.tier === "exact")) {
        hit = cand;
        tier = m.tier;
        flip = m.flip;
        if (tier === "exact" && !flip)
          break;
      }
    }
    if (!hit) {
      const copy = cloneMatch(row);
      const entry = { row: copy, id, guess: false };
      if (!byHour.has(hour))
        byHour.set(hour, []);
      byHour.get(hour).push(entry);
      out.push(copy);
      continue;
    }
    const oriented = flip ? reorientFootballRow(row) : row;
    overlayMatch(hit.row, oriented);
    if (!hasObSource(hit.row))
      hit.row.Game = pickBetterFootballGame(hit.row.Game, oriented.Game);
    hit.guess = tier === "exact" ? false : tier === "guess" ? true : hit.guess;
    hit.row.MergeGuess = hit.guess ? true : undefined;
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

function settledRows(result: PromiseSettledResult<ClientMatchDto[]>): ClientMatchDto[] {
  if (result.status !== "fulfilled" || !Array.isArray(result.value))
    return [];
  return result.value;
}

/**
 * PM/PF（VPS）与本机 OB 并行。一侧失败仍展示另一侧，避免 15s 超时把已连接的 OB 盘也清空。
 */
export async function combineFootballListSources(
  pmPfPromise: Promise<ClientMatchDto[]>,
  obPromise: Promise<ClientMatchDto[]>,
): Promise<ClientMatchDto[]> {
  const [pmPf, ob] = await Promise.allSettled([pmPfPromise, obPromise]);
  const list = mergeFootballClientLists(settledRows(pmPf), settledRows(ob));
  if (list.length)
    return list;
  const reason = pmPf.status === "rejected"
    ? pmPf.reason
    : ob.status === "rejected"
      ? ob.reason
      : null;
  if (reason)
    throw reason instanceof Error ? reason : new Error(String(reason));
  return [];
}
