/**
 * PM vs PF soccer market-type inventory (live open markets).
 * Usage (from repo root, with PREDICT_FUN_API_KEY in env):
 *   node --env-file=server/backend/.env devtools/tmp-football-market-types.mjs
 */
const GAMMA = "https://gamma-api.polymarket.com";
const PF = String(process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun").replace(/\/$/, "");
const KEY = String(process.env.PREDICT_FUN_API_KEY || "").trim();
const RELAY = String(process.env.PREDICT_FUN_HTTP_RELAY_ORIGIN || "").trim().replace(/\/$/, "");

const FOOTBALL_SPORT_KEYS = [
  "epl", "lal", "bun", "fl1", "sea", "ucl", "uel", "mls",
  "ere", "por", "uef", "fif", "mex", "bra", "arg", "copa",
  "jap", "afc", "caf",
];

async function gamma(path) {
  const r = await fetch(GAMMA + path);
  if (!r.ok)
    throw new Error(`Gamma ${r.status} ${path}`);
  return r.json();
}

async function pfGet(path) {
  const url = RELAY
    ? `${RELAY}/?url=${encodeURIComponent(PF + path)}`
    : PF + path;
  const r = await fetch(url, {
    headers: { Accept: "application/json", "x-api-key": KEY },
  });
  if (!r.ok)
    throw new Error(`PF ${r.status} ${path.slice(0, 80)}`);
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

function lineHint(m) {
  const q = String(m.question || m.groupItemTitle || m.title || "");
  const line = m.line ?? m.spread ?? m.handicap ?? m.total ?? m.points;
  return {
    line: line ?? null,
    question: q.slice(0, 100),
  };
}

const sports = await gamma("/sports");
const seriesByLeague = {};
for (const row of sports) {
  const s = String(row.sport || "").toLowerCase();
  if (FOOTBALL_SPORT_KEYS.includes(s))
    seriesByLeague[s] = String(row.series || "");
}

const now = Date.now();
const PAST = 24 * 3600e3;
const FUTURE = 7 * 24 * 3600e3;
const pmTypes = {};
const pmTypesByEvent = {};
const pmSample = {};
const pmEventCount = {};
const pmLineSamples = {};

for (const [league, series] of Object.entries(seriesByLeague)) {
  pmTypes[league] = {};
  pmTypesByEvent[league] = {};
  pmSample[league] = {};
  pmLineSamples[league] = {};
  pmEventCount[league] = 0;
  let cursor = "";
  for (let page = 0; page < 6; page += 1) {
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
            const hint = lineHint(m);
            pmSample[league][t] = {
              event: String(ev.title || "").slice(0, 90),
              market: hint.question,
              line: hint.line,
              outcomes: parseArr(m.outcomes).slice(0, 6),
            };
          }
          if (!pmLineSamples[league][t] && (m.line != null || m.spread != null || /[+-]?\d+(\.\d+)?/.test(String(m.groupItemTitle || m.question || "")))) {
            pmLineSamples[league][t] = {
              event: String(ev.title || "").slice(0, 70),
              groupItemTitle: String(m.groupItemTitle || "").slice(0, 40),
              question: String(m.question || "").slice(0, 90),
              line: m.line ?? m.spread ?? m.handicap ?? m.total ?? null,
              outcomes: parseArr(m.outcomes).slice(0, 4),
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

// Aggregate PM totals across leagues
const pmAggMarkets = {};
const pmAggEvents = {};
let pmEventsTotal = 0;
for (const league of Object.keys(pmTypes)) {
  pmEventsTotal += pmEventCount[league] || 0;
  for (const [t, n] of Object.entries(pmTypes[league]))
    pmAggMarkets[t] = (pmAggMarkets[t] || 0) + n;
  for (const [t, n] of Object.entries(pmTypesByEvent[league]))
    pmAggEvents[t] = (pmAggEvents[t] || 0) + n;
}

// Prefer EPL sample for human-readable examples
const preferredSampleLeague = ["epl", "ucl", "lal", "bun", "mls"].find(l => pmSample[l] && Object.keys(pmSample[l]).length > 1)
  || Object.keys(pmSample).find(l => Object.keys(pmSample[l]).length > 0)
  || "epl";

const pfVariants = ["SPORTS_MATCH", "SPORTS_TEAM_MATCH", "SPORTS_FIFA_WORLD_CUP", "SPORTS_FIFA_FRIENDLIES"];
const pfByVariant = {};
const pfMarketTypes = {};
const pfOutcomeShapes = {};
const pfSample = {};
const pfTitleBuckets = {};
let pfCats = 0;
let pfMarkets = 0;
let pfMultiMarketCats = 0;

function bucketPfTitle(title) {
  const t = String(title || "").toLowerCase();
  if (/\bdraw\b/.test(t))
    return "draw";
  if (/\b(over|under|o\/u|total)\b/.test(t) || /\d+\.?\d*\s*(goals?|g)\b/.test(t))
    return "totals_like";
  if (/\b(spread|handicap|ah|asian)\b/.test(t) || /[+-]\d+(\.\d+)?/.test(t))
    return "spread_like";
  if (/\bbtts|both teams?\b/.test(t))
    return "btts";
  if (/\bdouble chance\b/.test(t))
    return "double_chance";
  if (/\bcorrect score|exact score\b/.test(t))
    return "correct_score";
  if (/\bhalftime|1st half|first half|ht\b/.test(t))
    return "half_related";
  if (/\bcorner\b/.test(t))
    return "corners";
  if (/\bgoalscorer|anytime scorer\b/.test(t))
    return "player_props";
  return "team_or_other";
}

if (!KEY) {
  console.error("WARN: PREDICT_FUN_API_KEY missing — PF section will be empty");
}
else {
  for (const variant of pfVariants) {
    const byId = new Map();
    let after;
    for (let page = 0; page < 10; page += 1) {
      const qs = new URLSearchParams({
        first: "50",
        status: "OPEN",
        marketVariant: variant,
        tagIds: "14",
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
    const types = {};
    const titleBuckets = {};
    let markets = 0;
    let multi = 0;
    for (const cat of byId.values()) {
      pfCats += 1;
      const ms = cat.markets || [];
      markets += ms.length;
      pfMarkets += ms.length;
      if (ms.length > 1) {
        multi += 1;
        pfMultiMarketCats += 1;
      }
      for (const m of ms) {
        const t = String(m.marketType || "(none)");
        types[t] = (types[t] || 0) + 1;
        pfMarketTypes[t] = (pfMarketTypes[t] || 0) + 1;
        const outs = m.outcomes || [];
        const shape = `${outs.length} outcomes`;
        pfOutcomeShapes[shape] = (pfOutcomeShapes[shape] || 0) + 1;
        const bucket = bucketPfTitle(m.title || cat.title);
        titleBuckets[bucket] = (titleBuckets[bucket] || 0) + 1;
        pfTitleBuckets[bucket] = (pfTitleBuckets[bucket] || 0) + 1;
        if (!pfSample[`${variant}::${t}`]) {
          pfSample[`${variant}::${t}`] = {
            cat: String(cat.title || "").slice(0, 90),
            marketTitle: String(m.title || "").slice(0, 90),
            nMarketsInCat: ms.length,
            outcomes: outs.slice(0, 4).map(o => ({
              name: o.team?.name || o.name,
              title: o.title,
            })),
          };
        }
        if (!pfSample[`bucket::${bucket}`]) {
          pfSample[`bucket::${bucket}`] = {
            variant,
            marketType: t,
            cat: String(cat.title || "").slice(0, 90),
            marketTitle: String(m.title || "").slice(0, 90),
          };
        }
      }
    }
    pfByVariant[variant] = {
      categories: byId.size,
      markets,
      multiMarketCategories: multi,
      marketTypes: types,
      titleBuckets,
    };
  }
}

function sortCountMap(obj) {
  return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));
}

const n4Candidates = ["spreads", "totals", "soccer_team_totals", "first_half_spreads", "first_half_totals", "both_teams_to_score", "double_chance", "moneyline", "first_half_moneyline"];
const pmCoverage = {};
for (const t of n4Candidates) {
  pmCoverage[t] = {
    markets: pmAggMarkets[t] || 0,
    events: pmAggEvents[t] || 0,
    eventCoveragePct: pmEventsTotal ? Math.round(1000 * (pmAggEvents[t] || 0) / pmEventsTotal) / 10 : 0,
  };
}

console.log(JSON.stringify({
  asOf: new Date().toISOString(),
  pm: {
    leaguesQueried: Object.keys(seriesByLeague),
    eventsTotal: pmEventsTotal,
    eventCountByLeague: pmEventCount,
    marketCountsByType: sortCountMap(pmAggMarkets),
    eventsHavingType: sortCountMap(pmAggEvents),
    n4CandidateCoverage: pmCoverage,
    samplesPreferredLeague: preferredSampleLeague,
    samples: pmSample[preferredSampleLeague],
    lineSamples: pmLineSamples[preferredSampleLeague],
  },
  pf: {
    keyPresent: Boolean(KEY),
    categories: pfCats,
    marketsTotal: pfMarkets,
    multiMarketCategories: pfMultiMarketCats,
    marketTypes: sortCountMap(pfMarketTypes),
    outcomeShapes: sortCountMap(pfOutcomeShapes),
    titleBuckets: sortCountMap(pfTitleBuckets),
    byVariant: pfByVariant,
    samples: pfSample,
  },
}, null, 2));
