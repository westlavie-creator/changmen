import { fetchObFootballMatchMarkets } from "@/runtime/obSportFootballFetch";

export type FootballSelection = {
  Name?: string;
  Odds?: number;
  Side?: string;
  OddID?: string;
};

export type FootballVenueOdds = {
  venue: string;
  Selections: FootballSelection[];
};

export type FootballObMarketRow = {
  hpid?: string;
  Name?: string;
  MarketCode?: string;
  Line?: number | null;
  Period?: string;
  Selections?: FootballSelection[];
  /** 电竞 BetRow 同款：一行一场馆。缺省则把 Selections 当单馆。 */
  Venues?: FootballVenueOdds[];
};

export function footballRowHasQuotes(row: FootballObMarketRow | null | undefined): boolean {
  if (!row)
    return false;
  if ((row.Venues || []).some(v => (v.Selections || []).length > 0))
    return true;
  return (row.Selections || []).length > 0;
}

export function footballRowVenues(row: FootballObMarketRow | null | undefined): FootballVenueOdds[] {
  if (!row)
    return [];
  if (row.Venues?.length)
    return row.Venues;
  if ((row.Selections || []).length)
    return [{ venue: "", Selections: row.Selections || [] }];
  return [];
}

const cache = new Map<string, { at: number; rows: FootballObMarketRow[] }>();
const inflight = new Map<string, Promise<FootballObMarketRow[]>>();
let active = 0;
const waiters: Array<() => void> = [];
const CONCURRENCY = 8;
const CACHE_TTL_MS = 45_000;
/** 详情已够丰富时不再重打；薄缓存只用于先上屏 */
const COMPLETE_N = 8;

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= CONCURRENCY)
    await new Promise<void>(resolve => waiters.push(resolve));
  active += 1;
  try {
    return await fn();
  }
  finally {
    active -= 1;
    waiters.shift()?.();
  }
}

export function peekFootballObMarkets(mid: string): FootballObMarketRow[] | undefined {
  const id = String(mid || "").trim();
  const hit = cache.get(id);
  if (!hit)
    return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(id);
    return undefined;
  }
  return hit.rows;
}

export function isFootballObMarketsComplete(rows: FootballObMarketRow[] | undefined): boolean {
  return (rows?.length || 0) >= COMPLETE_N;
}

export function loadFootballObMarkets(mid: string): Promise<FootballObMarketRow[]> {
  const id = String(mid || "").trim();
  if (!id)
    return Promise.resolve([]);
  const cached = peekFootballObMarkets(id);
  if (cached && isFootballObMarketsComplete(cached))
    return Promise.resolve(cached);
  const pending = inflight.get(id);
  if (pending)
    return pending;
  const job = withSlot(async () => {
    const list = await fetchObFootballMatchMarkets(id);
    const rows = Array.isArray(list) ? list as FootballObMarketRow[] : [];
    if (rows.length)
      cache.set(id, { at: Date.now(), rows });
    return rows;
  }).finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, job);
  return job;
}
