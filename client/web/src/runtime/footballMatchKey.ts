/**
 * 足球合场身份键（ARB_MULTI_SPORT §3c 目标键：联赛码 + 队名归一 + 时间窗 + 主客朝向）。
 * 队名归一走 @changmen/shared 单一来源（与 server PM∥PF 合场同表）。
 */
import type { ClientMatchDto } from "@/types/esport";
import { footballLeagueKey } from "@/runtime/footballLeague";
import { resolveFootballTeamKey } from "@changmen/shared/catalog/football_team_key";

const VS_RE = /\s+vs\.?\s+/i;
const UNKNOWN_FB = "unknown_fb";

export type FootballRowIdentity = {
  /** footballLeagueKey(Game)：catalog 码；不可解析原文保留；unknown_fb 通配。 */
  leagueKey: string;
  /** canonical 队名（含主客朝向）。 */
  home: string;
  away: string;
  /** 排序队名对（朝向无关，展示/调试用；匹配以 home/away 为准）。 */
  pair: [string, string];
  /** 开赛时间小时桶（同 server sportPairKeyResolved 口径）。 */
  hour: number;
};

/** 去掉队名侧的括号注（中文名/让球）与尾部让球数字。
 *  权衡：尾部数字剥离无法区分让球后缀与真队名尾数（Schalke 04 → "schalke"）；
 *  此时合场退为 guess（token 子集）层而非 exact，可接受；别名表只收剥离后形式。 */
function stripSide(side: string): string {
  return String(side || "")
    .replace(/[（(][^（）()]*[）)]/g, " ")
    .replace(/\s[-+]?\d+(\.\d+)?\s*$/, " ")
    .trim();
}

/**
 * 行 → 身份键组成。队名不可识别（OB 占位标题 / 结果标签）返回 null，调用方退回旧标题键。
 */
export function footballRowIdentity(row: Pick<ClientMatchDto, "Title" | "Game" | "StartTime">): FootballRowIdentity | null {
  const leagueKey = footballLeagueKey(row.Game);
  const parts = String(row.Title || "").split(VS_RE);
  if (parts.length < 2)
    return null;
  const home = resolveFootballTeamKey(stripSide(parts[0]));
  const away = resolveFootballTeamKey(stripSide(parts.slice(1).join(" vs ")));
  if (!home || !away)
    return null;
  const pair: [string, string] = home < away ? [home, away] : [away, home];
  const t = Number(row.StartTime) || 0;
  return { leagueKey, home, away, pair, hour: Math.floor(t / 3_600_000) };
}

/** 联赛匹配：同码或任一侧 unknown_fb 通配；真实码之间硬隔离（同电竞「同 Game 才匹配」）。 */
export function footballLeagueMatch(a: string, b: string): boolean {
  return a === b || a === UNKNOWN_FB || b === UNKNOWN_FB;
}

export type PairMatchTier = { tier: "exact" | "guess"; flip: boolean } | null;

function tokenSubset(x: string, y: string): boolean {
  const ys = y.split(" ");
  return x.split(" ").every(t => ys.includes(t));
}

/**
 * 同桶候选配对：canonical 全等 = exact；token 子集（如 guadalajara ⊂ guadalajara chivas）= guess。
 * guess 为单向收窄（cand ⊆ anchor）；反向不匹配按并列处理，禁止硬并。
 * flip=true 表示候选主客相对 anchor 翻转（overlay 前需 reorientFootballRow）。
 */
export function pairMatchTier(anchor: FootballRowIdentity, cand: FootballRowIdentity): PairMatchTier {
  if (anchor.home === cand.home && anchor.away === cand.away)
    return { tier: "exact", flip: false };
  if (anchor.home === cand.away && anchor.away === cand.home)
    return { tier: "exact", flip: true };
  if (tokenSubset(cand.home, anchor.home) && tokenSubset(cand.away, anchor.away))
    return { tier: "guess", flip: false };
  if (tokenSubset(cand.home, anchor.away) && tokenSubset(cand.away, anchor.home))
    return { tier: "guess", flip: true };
  return null;
}

/** spreads/totals 判定：基础盘与 ht_ 前缀盘（与 footballMarketLayout 同口径）。 */
function isSpreadsCode(code: string): boolean {
  return code === "spreads" || code.endsWith("_spreads");
}

function isTotalsCode(code: string): boolean {
  return code === "totals" || code.endsWith("_totals");
}

/**
 * 主客翻转重定向：交换队名与赔率，让球线取反（totals 的 大/小 与线不动）。mirrors server orientSource。
 */
export function reorientFootballRow<T extends Pick<ClientMatchDto, "Title" | "Bets">>(row: T): T {
  const parts = String(row.Title || "").split(VS_RE);
  const title = parts.length < 2
    ? row.Title
    : `${stripSide(parts.slice(1).join(" vs "))} vs ${stripSide(parts[0])}`;
  const bets = (row.Bets || []).map((b) => {
    const code = String(b.MarketCode || "");
    const totals = isTotalsCode(code);
    const spreads = isSpreadsCode(code);
    // totals（大/小）与主客朝向无关：source 原样保留（对齐 server orientSource；
    // HomeID/AwayID 是 WS 订阅与下单 oid，不可与赔率错配）。其余盘口整体交换。
    const sources = Object.fromEntries(Object.entries(b.Sources || {}).map(([k, s]) => [k, totals || !s
      ? s
      : {
          ...s,
          HomeID: s.AwayID,
          AwayID: s.HomeID,
          HomeOdds: s.AwayOdds,
          AwayOdds: s.HomeOdds,
          HomeMarketID: s.AwayMarketID,
          AwayMarketID: s.HomeMarketID,
        }]));
    return {
      ...b,
      Line: spreads && typeof b.Line === "number" ? -b.Line : b.Line,
      HomeName: totals ? b.HomeName : b.AwayName,
      AwayName: totals ? b.AwayName : b.HomeName,
      HomeID: totals ? b.HomeID : b.AwayID,
      AwayID: totals ? b.AwayID : b.HomeID,
      Sources: sources,
    };
  });
  return { ...row, Title: title, Bets: bets } as T;
}
