import type { ViewBet, ViewMatch } from "@/models/match";
import type {
  FootballObMarketRow,
  FootballSelection,
  FootballVenueOdds,
} from "@/runtime/footballObMarkets";

export type SportLiveOddsReader = {
  get: (platform: string, subscribeId: string) => number;
};

const VENUE_ORDER = ["Polymarket", "PredictFun", "OB"];

function venueRank(venue: string) {
  const i = VENUE_ORDER.indexOf(String(venue || ""));
  return i < 0 ? 99 : i;
}

function itemOdds(
  item: ViewBet["items"][0],
  side: "home" | "away" | "draw",
  live?: SportLiveOddsReader,
): number {
  if (side === "draw")
    return Number(item.fallbackDrawOdds) || 0;
  const sub = side === "home"
    ? (item.homeSubscribeId || item.homeId)
    : (item.awaySubscribeId || item.awayId);
  const fromLive = live?.get(item.type, sub) || 0;
  if (fromLive > 0)
    return fromLive;
  return side === "home" ? Number(item.fallbackHomeOdds) || 0 : Number(item.fallbackAwayOdds) || 0;
}

function isMoneyline(code: string) {
  return !code || code === "moneyline" || code.endsWith("_moneyline");
}

function isTotalsCode(code: string) {
  return code === "totals" || code.endsWith("_totals");
}

const CODE_TITLE: Record<string, string> = {
  moneyline: "全场胜负",
  ht_moneyline: "半场胜负",
  spreads: "让球",
  ht_spreads: "半场让球",
  totals: "大小球",
  ht_totals: "半场大小",
};

/** 列表/详情标题：不把 moneyline 等英文码直接画到卡片上 */
export function footballMarketTitle(row: {
  Name?: string;
  MarketCode?: string;
  Line?: number | null;
}) {
  const name = String(row.Name || "").trim();
  const code = String(row.MarketCode || "").toLowerCase();
  const mapped = CODE_TITLE[code] || CODE_TITLE[name.toLowerCase()];
  if (mapped) {
    if (code.includes("spreads") || name.toLowerCase() === "spreads") {
      const n = Number(row.Line);
      if (Number.isFinite(n))
        return `${mapped} ${n > 0 ? `+${n}` : String(n)}`;
    }
    if (code.includes("totals") || name.toLowerCase() === "totals") {
      const n = Number(row.Line);
      if (Number.isFinite(n))
        return `${mapped} ${n}`;
    }
    if (!name || name.toLowerCase() === code || CODE_TITLE[name.toLowerCase()])
      return mapped;
  }
  return name || mapped || "盘口";
}

function selectionsFromItem(
  bet: ViewBet,
  item: ViewBet["items"][0],
  live?: SportLiveOddsReader,
): FootballSelection[] {
  const code = String(bet.marketCode || "");
  const name = bet.getBetName();
  const isTotals = isTotalsCode(code) || /大小/.test(name);
  const hasDraw = Number(item.fallbackDrawOdds) > 0;
  if (isTotals) {
    return [
      { Name: "大", Side: "over", Odds: itemOdds(item, "home", live) },
      { Name: "小", Side: "under", Odds: itemOdds(item, "away", live) },
    ];
  }
  if (isMoneyline(code) || hasDraw) {
    return [
      { Name: "主胜", Side: "home", Odds: itemOdds(item, "home", live) },
      { Name: "平", Side: "draw", Odds: itemOdds(item, "draw", live) },
      { Name: "客胜", Side: "away", Odds: itemOdds(item, "away", live) },
    ];
  }
  return [
    { Name: "主", Side: "home", Odds: itemOdds(item, "home", live) },
    { Name: "客", Side: "away", Odds: itemOdds(item, "away", live) },
  ];
}

function sortVenues(venues: FootballVenueOdds[]) {
  venues.sort((a, b) => venueRank(a.venue) - venueRank(b.venue) || a.venue.localeCompare(b.venue));
}

function listMarketKey(code: string, line: number | null | undefined) {
  return `${String(code || "moneyline").toLowerCase()}|${line ?? ""}`;
}

function bookRowKey(row: FootballObMarketRow): string {
  const code = String(row.MarketCode || "").toLowerCase();
  if (!code || code.startsWith("ob:"))
    return `x|${String(row.hpid || "")}|${String(row.Name || "").toLowerCase()}|${row.Line ?? ""}`;
  return listMarketKey(code, row.Line);
}

/**
 * 列表 ViewBet → 盘口行。每个场馆单独保留赔率（对齐电竞 BetRow 的 PlatformIcon 行）。
 */
export function viewBetsToMarketRows(
  match: ViewMatch,
  live?: SportLiveOddsReader,
): FootballObMarketRow[] {
  const out: FootballObMarketRow[] = [];
  const byKey = new Map<string, FootballObMarketRow>();
  for (const bet of match.bets || []) {
    const code = String(bet.marketCode || "");
    const key = listMarketKey(code, bet.line);
    let row = byKey.get(key);
    if (!row) {
      row = {
        Name: footballMarketTitle({ Name: bet.getBetName(), MarketCode: code || "moneyline", Line: bet.line }),
        MarketCode: code || "moneyline",
        Line: bet.line ?? null,
        Selections: [],
        Venues: [],
      };
      byKey.set(key, row);
      out.push(row);
    }
    for (const item of bet.items) {
      const venue = String(item.type || "").trim();
      if (!venue)
        continue;
      const selections = selectionsFromItem(bet, item, live);
      const bag = row.Venues!.find(v => v.venue === venue);
      if (bag)
        bag.Selections = selections;
      else
        row.Venues!.push({ venue, Selections: selections });
    }
  }
  for (const row of out) {
    sortVenues(row.Venues!);
    row.Selections = row.Venues?.[0]?.Selections || [];
  }
  return out;
}

/** OB 详情叠到列表行上，不覆盖 PM/PF。 */
export function mergeFootballBookRows(
  listRows: FootballObMarketRow[],
  obRows: FootballObMarketRow[],
): FootballObMarketRow[] {
  const out: FootballObMarketRow[] = (listRows || []).map(row => ({
    ...row,
    Selections: [...(row.Selections || [])],
    Venues: (row.Venues || []).map(v => ({ venue: v.venue, Selections: [...(v.Selections || [])] })),
  }));
  const index = new Map(out.map(row => [bookRowKey(row), row]));
  for (const ob of obRows || []) {
    const selections = [...(ob.Selections || [])];
    if (!selections.length)
      continue;
    const key = bookRowKey(ob);
    const hit = index.get(key);
    const obVenue: FootballVenueOdds = { venue: "OB", Selections: selections };
    if (!hit) {
      const copy: FootballObMarketRow = {
        ...ob,
        Selections: selections,
        Venues: [obVenue],
      };
      out.push(copy);
      index.set(key, copy);
      continue;
    }
    const ix = hit.Venues!.findIndex(v => v.venue === "OB");
    if (ix >= 0)
      hit.Venues![ix] = obVenue;
    else
      hit.Venues!.push(obVenue);
    sortVenues(hit.Venues!);
    if (ob.hpid)
      hit.hpid = ob.hpid;
    if (!hit.Selections?.length)
      hit.Selections = selections;
  }
  return out;
}
