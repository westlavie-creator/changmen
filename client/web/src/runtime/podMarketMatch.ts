/**
 * POD 跟单票 → 板上全场/半场 大小、独赢、让球。只对盘、比价；下单在 podFollowPlace。
 * 角球/罚牌不对到进球盘。命中一律猜测。
 */
import { formatPodPrice, type PodDropAlert } from "@/runtime/podAlerts";
import { podAlertLineKind } from "@/runtime/podBetSettings";
import type { PodBoardFixture, PodBoardMarket } from "@/runtime/podFixtureMatch";
import { podEvPercent } from "@/runtime/podYabo/ev";

const LINE_EPS = 1e-6;
const NON_GOAL = /corner|corners|角球|booking|bookings|cards?|yellow|red card|罚牌|黄牌|红牌|team\s*total|player|球队大小|队进球/i;

export type PodMarketSide = "over" | "under" | "home" | "away" | "draw";
export type PodMarketMatchStatus = "matched" | "none" | "skipped";
export type PodObQuoteStatus = "ok" | "short" | "none" | "locked" | "spike";

export type PodMarketMatch = {
  status: PodMarketMatchStatus;
  basis: "guess";
  side: PodMarketSide | null;
  line: number | null;
  boardLine: number | null;
  boardSide: PodMarketSide | null;
  marketCode: string;
  ob: boolean;
  quote: number;
  swapped: boolean;
  locked: boolean;
  oid: string;
  /** sportOddsStore 已有这条 oid（含锁 0）。自动下单要等这个，避免用列表 HTTP 快照抬 EV。 */
  fromLive: boolean;
  /** 副盘该档自己的 NVP；0 = 仍用警报 NVP。由 podYabo 写入。 */
  nvp: number;
  loose: boolean;
};

export type PodObQuoteCompare = {
  status: PodObQuoteStatus;
  quote: number;
  minObOdds: number;
  maxObOdds: number;
  evPercent: number;
};

/** 与 FootballOddsCell 同源：体育实时价 + 滚球线。禁止电竞 fo。 */
export type PodLiveOddsReader = {
  get: (platform: string, id: string) => number;
  has?: (platform: string, id: string) => boolean;
  getLine?: (oid: string) => number | null;
};

function emptyMatch(status: PodMarketMatchStatus = "none"): PodMarketMatch {
  return {
    status,
    basis: "guess",
    side: null,
    line: null,
    boardLine: null,
    boardSide: null,
    marketCode: "",
    ob: false,
    quote: 0,
    swapped: false,
    locked: false,
    oid: "",
    fromLive: false,
    nvp: 0,
    loose: false,
  };
}

function sameLine(left: number | null | undefined, right: number): boolean {
  const n = Number(left);
  return Number.isFinite(n) && Math.abs(n - right) < LINE_EPS;
}

function isEvenLine(line: number | null | undefined): boolean {
  const n = Number(line);
  return !Number.isFinite(n) || Math.abs(n) < LINE_EPS;
}

function looksNonGoal(alert: Pick<PodDropAlert, "market" | "league">, name = ""): boolean {
  return NON_GOAL.test(`${alert.market} ${alert.league} ${name}`);
}

function totalsSide(outcome: string): Extract<PodMarketSide, "over" | "under"> | null {
  const raw = String(outcome || "").toLowerCase();
  if (raw === "over")
    return "over";
  if (raw === "under")
    return "under";
  return null;
}

function homeAwaySide(outcome: string): Extract<PodMarketSide, "home" | "away"> | null {
  const raw = String(outcome || "").toLowerCase();
  if (raw === "home" || raw === "away")
    return raw;
  return null;
}

function mlSide(outcome: string): Extract<PodMarketSide, "home" | "away" | "draw"> | null {
  const raw = String(outcome || "").toLowerCase();
  if (raw === "home" || raw === "away" || raw === "draw")
    return raw;
  return null;
}

function boardCode(kind: "totals" | "moneyline" | "spreads", half: boolean): string {
  if (kind === "totals")
    return half ? "ht_totals" : "totals";
  if (kind === "moneyline")
    return half ? "ht_moneyline" : "moneyline";
  return half ? "ht_spreads" : "spreads";
}

function oidForSide(row: PodBoardMarket, side: PodMarketSide, swapped: boolean): string {
  if (side === "over")
    return String(row.oidHome || "").trim();
  if (side === "under")
    return String(row.oidAway || "").trim();
  if (side === "draw")
    return String(row.oidDraw || "").trim();
  if (side === "home")
    return String((swapped ? row.oidAway : row.oidHome) || "").trim();
  return String((swapped ? row.oidHome : row.oidAway) || "").trim();
}

function fallbackQuote(row: PodBoardMarket, side: PodMarketSide, swapped: boolean): number {
  if (side === "over")
    return Number(row.quoteHome) || 0;
  if (side === "under")
    return Number(row.quoteAway) || 0;
  if (side === "draw")
    return Number(row.quoteDraw) || 0;
  if (side === "home")
    return Number(swapped ? row.quoteAway : row.quoteHome) || 0;
  return Number(swapped ? row.quoteHome : row.quoteAway) || 0;
}

function liveKnown(live: PodLiveOddsReader | undefined, id: string): boolean {
  if (!live || !id)
    return false;
  if (live.has)
    return live.has("OB", id);
  return (live.get("OB", id) || 0) > 0;
}

function liveQuote(
  oid: string,
  fallback: number,
  live?: PodLiveOddsReader,
): { quote: number; locked: boolean; fromLive: boolean } {
  if (!oid || !live || !liveKnown(live, oid))
    return { quote: fallback, locked: false, fromLive: false };
  const n = Number(live.get("OB", oid)) || 0;
  if (!(n > 0))
    return { quote: 0, locked: true, fromLive: true };
  return { quote: n, locked: false, fromLive: true };
}

function rowLine(row: PodBoardMarket, live?: PodLiveOddsReader): number | null {
  if (live?.getLine) {
    for (const raw of [row.oidHome, row.oidAway, row.oidDraw]) {
      const id = String(raw || "").trim();
      if (!id)
        continue;
      const n = live.getLine(id);
      if (n != null && Number.isFinite(n))
        return n;
    }
  }
  return row.line;
}

function boardSideFor(side: PodMarketSide, swapped: boolean): PodMarketSide {
  if (!swapped || side === "over" || side === "under" || side === "draw")
    return side;
  return side === "home" ? "away" : "home";
}

function finish(
  hit: PodBoardMarket,
  side: PodMarketSide,
  line: number | null,
  swapped: boolean,
  live?: PodLiveOddsReader,
  boardLine: number | null = line,
  extra: { nvp?: number; loose?: boolean } = {},
): PodMarketMatch {
  const oid = oidForSide(hit, side, swapped);
  const resolved = liveQuote(oid, fallbackQuote(hit, side, swapped), live);
  return {
    status: "matched",
    basis: "guess",
    side,
    line,
    boardLine,
    boardSide: boardSideFor(side, swapped),
    marketCode: hit.marketCode,
    ob: Boolean(hit.ob),
    quote: resolved.quote,
    swapped,
    locked: resolved.locked,
    oid,
    fromLive: resolved.fromLive,
    nvp: Number(extra.nvp) > 1 ? Number(extra.nvp) : 0,
    loose: extra.loose === true,
  };
}

function pickRows(
  fixture: Pick<PodBoardFixture, "markets"> | null | undefined,
  code: string,
  pred: (row: PodBoardMarket) => boolean,
): PodBoardMarket[] {
  const rows = (fixture?.markets || []).filter(row => (
    String(row.marketCode || "").toLowerCase() === code && pred(row)
  ));
  rows.sort((a, b) => Number(b.ob) - Number(a.ob) || a.id - b.id);
  return rows;
}

function noneWith(
  side: PodMarketSide,
  line: number,
  code: string,
  swapped = false,
): PodMarketMatch {
  return {
    ...emptyMatch("none"),
    side,
    line,
    marketCode: code,
    swapped,
  };
}

function matchTotals(
  alert: Pick<PodDropAlert, "market" | "outcome" | "points" | "league">,
  fixture: Pick<PodBoardFixture, "markets"> | null | undefined,
  half: boolean,
  live?: PodLiveOddsReader,
): PodMarketMatch {
  const code = boardCode("totals", half);
  if (looksNonGoal(alert))
    return emptyMatch("none");
  const side = totalsSide(alert.outcome);
  if (!side)
    return emptyMatch("none");
  const points = Number(alert.points);
  if (!Number.isFinite(points))
    return emptyMatch("none");
  const rows = pickRows(fixture, code, row => (
    !looksNonGoal(alert, row.name) && sameLine(rowLine(row, live), points)
  ));
  if (rows.length)
    return finish(rows[0], side, points, false, live);
  return noneWith(side, points, code);
}

function matchMoneyline(
  alert: Pick<PodDropAlert, "outcome" | "points">,
  fixture: Pick<PodBoardFixture, "markets"> | null | undefined,
  half: boolean,
  swapped: boolean,
  live?: PodLiveOddsReader,
): PodMarketMatch {
  const code = boardCode("moneyline", half);
  const side = mlSide(alert.outcome);
  if (!side)
    return emptyMatch("none");
  if (!isEvenLine(alert.points))
    return emptyMatch("none");
  const rows = pickRows(fixture, code, row => isEvenLine(row.line));
  if (!rows.length)
    return noneWith(side, 0, code, swapped);
  return finish(rows[0], side, rows[0].line, swapped, live);
}

/** POD points 是被降那一侧的盘；OB Line 是主队视角 hv。 */
export function podSpreadToBoardHomeLine(
  outcome: "home" | "away",
  points: number,
  swapped = false,
): number {
  const podHome = outcome === "home" ? points : -points;
  return swapped ? -podHome : podHome;
}

function matchSpreads(
  alert: Pick<PodDropAlert, "market" | "outcome" | "points" | "league">,
  fixture: Pick<PodBoardFixture, "markets"> | null | undefined,
  half: boolean,
  swapped: boolean,
  live?: PodLiveOddsReader,
): PodMarketMatch {
  const code = boardCode("spreads", half);
  if (looksNonGoal(alert))
    return emptyMatch("none");
  const side = homeAwaySide(alert.outcome);
  if (!side)
    return emptyMatch("none");
  const points = Number(alert.points);
  if (!Number.isFinite(points))
    return emptyMatch("none");
  const want = podSpreadToBoardHomeLine(side, points, swapped);
  const rows = pickRows(fixture, code, row => (
    !looksNonGoal(alert, row.name) && sameLine(rowLine(row, live), want)
  ));
  if (rows.length)
    return finish(rows[0], side, points, swapped, live, want);
  return noneWith(side, points, code, swapped);
}

/** 全场进球大小。让球/独赢/半场返回 skipped。 */
export function matchPodAlertToFtTotals(
  alert: Pick<PodDropAlert, "lineType" | "market" | "outcome" | "points" | "period" | "league">,
  fixture: Pick<PodBoardFixture, "markets"> | null | undefined,
  live?: PodLiveOddsReader,
): PodMarketMatch {
  const kind = podAlertLineKind(alert);
  const period = Number(alert.period) || 0;
  if (kind !== "totals" || period !== 0)
    return emptyMatch("skipped");
  return matchTotals(alert, fixture, false, live);
}

/** 全场/半场 大小、均势独赢、让球。欧洲让球 1X2 与角球/罚牌不算。 */
export function matchPodAlertToMarket(
  alert: Pick<PodDropAlert, "lineType" | "market" | "outcome" | "points" | "period" | "league">,
  fixture: Pick<PodBoardFixture, "markets"> | null | undefined,
  swapped = false,
  live?: PodLiveOddsReader,
): PodMarketMatch {
  const kind = podAlertLineKind(alert);
  const period = Number(alert.period) || 0;
  if (period !== 0 && period !== 1)
    return emptyMatch("skipped");
  const half = period === 1;
  if (kind === "totals")
    return matchTotals(alert, fixture, half, live);
  if (kind === "moneyline")
    return matchMoneyline(alert, fixture, half, swapped, live);
  if (kind === "spreads")
    return matchSpreads(alert, fixture, half, swapped, live);
  return emptyMatch("skipped");
}

export function comparePodObQuote(
  match: PodMarketMatch,
  minObOdds: number,
  opts: { maxObOdds?: number; nvp?: number } = {},
): PodObQuoteCompare {
  const min = Number(minObOdds);
  const max = Number(opts.maxObOdds) || 0;
  const quote = Number(match.quote) || 0;
  const evPercent = podEvPercent(quote, Number(opts.nvp) || 0);
  const base = { quote, minObOdds: min, maxObOdds: max, evPercent };
  if (match.status !== "matched" || !match.ob)
    return { status: "none", ...base, quote: match.ob ? quote : 0 };
  if (match.locked)
    return { status: "locked", ...base, quote: 0, evPercent: 0 };
  if (!(quote > 1) || !(min > 1))
    return { status: "none", ...base };
  if (max > 1 && quote > max + LINE_EPS)
    return { status: "spike", ...base };
  if (quote + LINE_EPS >= min)
    return { status: "ok", ...base };
  return { status: "short", ...base };
}

function formatSignedLine(line: number | null): string {
  const n = Number(line);
  if (!Number.isFinite(n))
    return "";
  if (n > 0)
    return `+${n}`;
  return String(n);
}

export function formatPodMarketMatch(row: PodMarketMatch): string {
  if (row.status === "skipped")
    return "盘暂未对";
  if (row.status !== "matched")
    return "盘未对上";
  const half = String(row.marketCode || "").startsWith("ht_");
  const prefix = half ? "半场" : "全场";
  let label = "";
  if (row.marketCode === "moneyline" || row.marketCode === "ht_moneyline") {
    const side = row.side === "away" ? "客" : row.side === "draw" ? "平" : "主";
    label = `${prefix}独赢 ${side}`;
  }
  else if (row.marketCode === "spreads" || row.marketCode === "ht_spreads") {
    const side = row.side === "away" ? "客" : "主";
    const pts = formatSignedLine(row.line);
    label = pts ? `${prefix}让球 ${side} ${pts}` : `${prefix}让球 ${side}`;
  }
  else {
    const side = row.side === "under" ? "小" : "大";
    const line = row.line == null ? "" : String(row.line);
    label = line ? `${prefix}大小 ${line} ${side}` : `${prefix}大小 ${side}`;
  }
  if (row.swapped && (row.side === "home" || row.side === "away"))
    label += " · 主客相反";
  const bits = ["盘已对上", label];
  if (row.loose)
    bits.push("副盘");
  if (row.ob)
    bits.push("OB");
  return bits.join(" · ");
}

export function formatPodObQuote(row: PodObQuoteCompare): string {
  if (row.status === "locked")
    return "OB 锁盘";
  if (row.status === "none")
    return "OB价 —";
  const price = formatPodPrice(row.quote);
  if (row.status === "spike")
    return `OB ${price} 异常`;
  return row.status === "ok" ? `OB ${price} 够` : `OB ${price} 不够`;
}
