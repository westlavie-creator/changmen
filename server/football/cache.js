/** @typedef {import('./parse_football.js').buildFootballMatch extends (...args: any) => infer R ? R : never} FootballMatch */

/** @type {{ matches: FootballMatch[], leagues: Array<{ sport: string, name: string, series: string, matchCount?: number }>, builtAt: number, lastError: string | null, refreshing: boolean }} */
let state = {
  matches: [],
  leagues: [],
  builtAt: 0,
  lastError: null,
  refreshing: false,
};

export function getFootballCache() {
  return state;
}

/**
 * @param {FootballMatch[]} matches
 * @param {Array<{ sport: string, name: string, series: string }>} leagues
 */
export function setFootballCache(matches, leagues) {
  const counts = new Map();
  for (const m of matches) {
    counts.set(m.League, (counts.get(m.League) || 0) + 1);
  }
  state = {
    matches,
    leagues: leagues.map(l => ({
      ...l,
      matchCount: counts.get(l.sport) || 0,
    })),
    builtAt: Date.now(),
    lastError: null,
    refreshing: false,
  };
}

/** @param {string} message */
export function setFootballCacheError(message) {
  state = {
    ...state,
    lastError: message,
    refreshing: false,
  };
}

export function setFootballCacheRefreshing(refreshing) {
  state = { ...state, refreshing };
}

/**
 * @param {{ league?: string, status?: string, q?: string, pageIndex?: number, pageSize?: number }} params
 */
export function queryFootballCache(params = {}) {
  let list = [...state.matches];
  const league = String(params.league ?? "").trim().toLowerCase();
  const status = String(params.status ?? "all").trim().toLowerCase();
  const q = String(params.q ?? "").trim().toLowerCase();
  const pageIndex = Math.max(1, Number(params.pageIndex) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));

  if (league)
    list = list.filter(m => m.League.toLowerCase() === league);
  if (status && status !== "all")
    list = list.filter(m => m.Status === status);
  if (q) {
    list = list.filter((m) => {
      if (m.Title.toLowerCase().includes(q))
        return true;
      if (m.HomeTeam.toLowerCase().includes(q))
        return true;
      if (m.AwayTeam.toLowerCase().includes(q))
        return true;
      if (m.LeagueName.toLowerCase().includes(q))
        return true;
      return false;
    });
  }

  const total = list.length;
  const start = (pageIndex - 1) * pageSize;
  const page = list.slice(start, start + pageSize);
  return {
    list: page,
    total,
    pageIndex,
    pageSize,
    builtAt: state.builtAt,
  };
}
