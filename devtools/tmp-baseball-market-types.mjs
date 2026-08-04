/**
 * PM vs PF baseball market-type inventory (VPS direct).
 */
const GAMMA = "https://gamma-api.polymarket.com";
const PF = String(process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun").replace(/\/$/, "");
const KEY = String(process.env.PREDICT_FUN_API_KEY || "").trim();

async function gamma(path) {
  const r = await fetch(GAMMA + path);
  if (!r.ok)
    throw new Error(`Gamma ${r.status} ${path}`);
  return r.json();
}

async function pfGet(path) {
  const r = await fetch(PF + path, {
    headers: { Accept: "application/json", "x-api-key": KEY },
  });
  if (!r.ok)
    throw new Error(`PF ${r.status}`);
  return r.json();
}

function parseArr(v) {
  if (Array.isArray(v))
    return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    }
    catch {
      return [];
    }
  }
  return [];
}

function mtype(m) {
  return String(m.sportsMarketType ?? m.sports_market_type ?? m.marketType ?? "(none)").toLowerCase();
}

function isOpen(m) {
  if (m.active === false || m.closed)
    return false;
  if (m.accepting_orders === false || m.acceptingOrders === false)
    return false;
  return true;
}

const sports = await gamma("/sports");
const want = new Set(["mlb", "kbo", "npb", "cpbl"]);
const seriesByLeague = {};
for (const row of sports) {
  const s = String(row.sport || "").toLowerCase();
  if (want.has(s))
    seriesByLeague[s] = String(row.series || "");
}

const now = Date.now();
const PAST = 24 * 3600e3;
const FUTURE = 7 * 24 * 3600e3;
const pmTypes = {};
const pmTypesByEvent = {};
const pmSample = {};
const pmEventCount = {};

for (const [league, series] of Object.entries(seriesByLeague)) {
  pmTypes[league] = {};
  pmTypesByEvent[league] = {};
  pmSample[league] = {};
  pmEventCount[league] = 0;
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const qs = new URLSearchParams({
      closed: "false",
      limit: "200",
      order: "startTime",
      ascending: "true",
      start_time_min: new Date(now - PAST).toISOString(),
      start_time_max: new Date(now + FUTURE).toISOString(),
    });
    qs.append("series_id", series);
    if (cursor)
      qs.set("after_cursor", cursor);
    const data = await gamma(`/events/keyset?${qs}`);
    const batch = data.events || data.data || (Array.isArray(data) ? data : []);
    for (const ev of batch) {
      const open = (ev.markets || []).filter(isOpen);
      if (!open.length)
        continue;
      pmEventCount[league] += 1;
      const seen = new Set();
      for (const m of open) {
        const t = mtype(m);
        pmTypes[league][t] = (pmTypes[league][t] || 0) + 1;
        if (!seen.has(t)) {
          seen.add(t);
          pmTypesByEvent[league][t] = (pmTypesByEvent[league][t] || 0) + 1;
          if (!pmSample[league][t]) {
            pmSample[league][t] = {
              event: String(ev.title || "").slice(0, 90),
              market: String(m.question || m.groupItemTitle || m.slug || "").slice(0, 90),
              outcomes: parseArr(m.outcomes).slice(0, 6),
            };
          }
        }
      }
    }
    cursor = String(data.next_cursor || data.cursor || data.after_cursor || "");
    if (!cursor || !batch.length)
      break;
  }
}

const byId = new Map();
let after;
for (let page = 0; page < 8; page += 1) {
  const qs = new URLSearchParams({
    first: "50",
    status: "OPEN",
    marketVariant: "SPORTS_TEAM_MATCH",
    tagIds: "142,143",
  });
  if (after)
    qs.set("after", after);
  const res = await pfGet(`/v1/categories?${qs}`);
  for (const row of res.data || []) {
    const id = String(row.id || row.slug || "");
    if (id && !byId.has(id))
      byId.set(id, row);
  }
  after = res.cursor ? String(res.cursor) : undefined;
  if (!after || !(res.data || []).length)
    break;
}

const pfMarketTypes = {};
const pfOutcomeShapes = {};
const pfSample = {};
let pfCats = 0;
let pfMarkets = 0;
let pfMultiMarketCats = 0;
for (const cat of byId.values()) {
  pfCats += 1;
  const markets = cat.markets || [];
  pfMarkets += markets.length;
  if (markets.length > 1)
    pfMultiMarketCats += 1;
  for (const m of markets) {
    const t = String(m.marketType || "(none)");
    pfMarketTypes[t] = (pfMarketTypes[t] || 0) + 1;
    const outs = m.outcomes || [];
    const key = `${outs.length} outcomes`;
    pfOutcomeShapes[key] = (pfOutcomeShapes[key] || 0) + 1;
    if (!pfSample[t]) {
      pfSample[t] = {
        cat: String(cat.title || "").slice(0, 90),
        marketTitle: String(m.title || "").slice(0, 90),
        nMarketsInCat: markets.length,
        outcomes: outs.slice(0, 4).map(o => ({
          name: o.team?.name || o.name,
          title: o.title,
        })),
      };
    }
  }
}

// also check if PF has any non-moneyline under Baseball tag with other variants
const extraVariants = ["SPORTS_MATCH", "SPORTS_TEAM_MATCH"];
const pfVariantScan = {};
for (const variant of extraVariants) {
  const qs = new URLSearchParams({
    first: "50",
    status: "OPEN",
    marketVariant: variant,
    tagIds: "142,143",
  });
  const res = await pfGet(`/v1/categories?${qs}`);
  const types = {};
  for (const cat of res.data || []) {
    for (const m of cat.markets || []) {
      const t = String(m.marketType || "(none)");
      types[t] = (types[t] || 0) + 1;
    }
  }
  pfVariantScan[variant] = {
    categoriesPage1: (res.data || []).length,
    marketTypes: types,
  };
}

console.log(JSON.stringify({
  pmEventCount,
  pmMarketCountsByLeagueAndType: pmTypes,
  pmEventsHavingType: pmTypesByEvent,
  pmSamplesMlb: pmSample.mlb,
  pf: {
    categories: pfCats,
    marketsTotal: pfMarkets,
    multiMarketCategories: pfMultiMarketCats,
    marketTypes: pfMarketTypes,
    outcomeShapes: pfOutcomeShapes,
    samples: pfSample,
    variantScan: pfVariantScan,
  },
}, null, 2));
