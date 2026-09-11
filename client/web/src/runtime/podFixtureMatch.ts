/**
 * POD 警报 → 足球板赛事。只对场，不对盘、不算价。
 * 本阶段仅拉丁队名 + 开赛时间窗；中文别名以后再加。命中一律标猜测。
 */
import { footballLeagueKey } from "@/runtime/footballLeague";
import type { PodDropAlert } from "@/runtime/podAlerts";

export const POD_FIXTURE_TIME_WINDOW_MS = 20 * 60 * 1000;

const STOP = new Set([
  "fc", "cf", "sc", "afc", "the", "de", "of", "club", "fk", "sk", "ac", "as", "ud", "cd",
]);

const WEAK = new Set([
  "united", "city", "real", "sport", "sporting", "athletic", "atletico",
  "rangers", "wanderers", "rovers", "youth", "women", "ladies", "reserve",
  "u21", "u23", "ii",
]);

const JUNK_TEAM = /^(大|小|大球|小球|over|under|o\/u|主队|客队)$/i;

export type PodBoardFixture = {
  id: number;
  title: string;
  game: string;
  startAt: number;
  obMid: string;
  homeName: string;
  awayName: string;
};

export type PodFixtureHit = {
  fixture: PodBoardFixture;
  swapped: boolean;
  score: number;
};

export type PodFixtureMatchStatus = "matched" | "pending" | "none";

export type PodFixtureMatch = {
  status: PodFixtureMatchStatus;
  basis: "guess";
  hits: PodFixtureHit[];
};

function fold(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`´]/g, "");
}

function hasLatin(raw: string): boolean {
  return /[a-z]/i.test(raw);
}

function latinTokens(raw: string): string[] {
  return fold(raw)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOP.has(t));
}

function isJunkTeam(name: string): boolean {
  return !String(name || "").trim() || JUNK_TEAM.test(String(name).trim());
}

function splitTitle(title: string): { home: string; away: string } | null {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  if (parts.length < 2)
    return null;
  const home = parts[0].trim();
  const away = parts.slice(1).join(" vs ").trim();
  if (!home || !away)
    return null;
  return { home, away };
}

export function teamNameScore(a: string, b: string): number {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right || isJunkTeam(left) || isJunkTeam(right))
    return 0;
  const compactA = fold(left).replace(/[^a-z0-9]+/g, "");
  const compactB = fold(right).replace(/[^a-z0-9]+/g, "");
  if (compactA && compactA === compactB)
    return 1;
  if (!hasLatin(left) || !hasLatin(right))
    return 0;
  const A = latinTokens(left);
  const B = latinTokens(right);
  if (!A.length || !B.length)
    return 0;
  const setB = new Set(B);
  const hits: string[] = [];
  for (const token of A) {
    if (setB.has(token)) {
      hits.push(token);
      continue;
    }
    const prefix = B.find(other => (
      Math.min(token.length, other.length) >= 5
      && (token.startsWith(other) || other.startsWith(token))
    ));
    if (prefix)
      hits.push(token);
  }
  const strong = hits.filter(t => !WEAK.has(t));
  if (!strong.length)
    return 0;
  return strong.length / Math.min(A.filter(t => !WEAK.has(t)).length || A.length, B.filter(t => !WEAK.has(t)).length || B.length);
}

function pairScore(
  alertHome: string,
  alertAway: string,
  boardHome: string,
  boardAway: string,
): { score: number; swapped: boolean } {
  const straight = Math.min(teamNameScore(alertHome, boardHome), teamNameScore(alertAway, boardAway));
  const swapped = Math.min(teamNameScore(alertHome, boardAway), teamNameScore(alertAway, boardHome));
  if (swapped > straight)
    return { score: swapped, swapped: true };
  return { score: straight, swapped: false };
}

export function fixtureFromViewMatch(row: {
  id: number;
  title: string;
  game: string;
  startAt: number;
  providers?: Record<string, string | number>;
  bets?: Array<{ homeName?: string; awayName?: string }>;
}): PodBoardFixture {
  const fromTitle = splitTitle(row.title);
  let home = fromTitle?.home || "";
  let away = fromTitle?.away || "";
  if (isJunkTeam(home) || isJunkTeam(away)) {
    home = "";
    away = "";
  }
  if (!home || !away) {
    for (const bet of row.bets || []) {
      const h = String(bet.homeName || "").trim();
      const a = String(bet.awayName || "").trim();
      if (h && a && !isJunkTeam(h) && !isJunkTeam(a)) {
        home = h;
        away = a;
        break;
      }
    }
  }
  return {
    id: row.id,
    title: String(row.title || "").trim(),
    game: String(row.game || "").trim(),
    startAt: Number(row.startAt) || 0,
    obMid: String(row.providers?.OB || "").trim(),
    homeName: home,
    awayName: away,
  };
}

const TEAM_MIN = 0.5;

export function matchPodAlertToFixtures(
  alert: Pick<PodDropAlert, "home" | "away" | "starts" | "league">,
  fixtures: PodBoardFixture[],
  windowMs = POD_FIXTURE_TIME_WINDOW_MS,
): PodFixtureMatch {
  const starts = Number(alert.starts) || 0;
  if (!(starts > 0))
    return { status: "none", basis: "guess", hits: [] };
  const ranked: PodFixtureHit[] = [];
  for (const fixture of fixtures) {
    if (!(fixture.startAt > 0))
      continue;
    if (Math.abs(fixture.startAt - starts) > windowMs)
      continue;
    const pair = pairScore(alert.home, alert.away, fixture.homeName, fixture.awayName);
    if (pair.score < TEAM_MIN)
      continue;
    ranked.push({ fixture, swapped: pair.swapped, score: pair.score });
  }
  ranked.sort((a, b) => b.score - a.score || Number(Boolean(b.fixture.obMid)) - Number(Boolean(a.fixture.obMid)));
  let hits = ranked;
  if (hits.length > 1) {
    const league = footballLeagueKey(alert.league);
    if (league && league !== "unknown_fb") {
      const narrowed = hits.filter(h => footballLeagueKey(h.fixture.game) === league);
      if (narrowed.length)
        hits = narrowed;
    }
  }
  if (hits.length === 1)
    return { status: "matched", basis: "guess", hits };
  if (hits.length > 1)
    return { status: "pending", basis: "guess", hits };
  return { status: "none", basis: "guess", hits: [] };
}

export function formatPodFixtureMatch(row: PodFixtureMatch): string {
  if (row.status === "none")
    return "未对上";
  if (row.status === "pending")
    return `待确认 · ${row.hits.length} 场`;
  const hit = row.hits[0];
  const title = hit?.fixture.title || "板上比赛";
  const bits = ["已对上", title];
  if (hit?.fixture.obMid)
    bits.push("OB");
  if (hit?.swapped)
    bits.push("主客相反");
  return bits.join(" · ");
}
