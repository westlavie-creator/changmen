/**
 * One-off: PM 全棒球联赛 vs PredictFun 棒球 覆盖对比（只读，不落库）。
 * 用法: node --env-file=server/backend/.env devtools/tmp-baseball-pm-pf-compare.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const GAMMA = process.env.POLYMARKET_GAMMA_BASE || "https://gamma-api.polymarket.com";
const PF_API = String(process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun").replace(/\/$/, "");
const PF_KEY = String(process.env.PREDICT_FUN_API_KEY || "").trim();
const RELAY = String(
  process.env.PREDICT_FUN_HTTP_RELAY_ORIGIN
  || process.env.HK_RELAY_ORIGIN
  || "",
).trim().replace(/\/+$/, "");
const PAST_MS = 24 * 3600 * 1000;
const FUTURE_MS = 7 * 24 * 3600 * 1000;
const PM_LEAGUES = ["mlb", "kbo", "npb", "cpbl", "cuba"];

function normTeam(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\b(fc|sc|baseball|club|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pairKey(a, b) {
  const x = normTeam(a);
  const y = normTeam(b);
  return [x, y].sort().join("||");
}

function hourBucket(ms) {
  return Math.floor(Number(ms) / (3600 * 1000));
}

function splitTitleTeams(title) {
  const text = String(title || "").trim();
  const parts = text.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2)
    return { home: parts[0].trim(), away: parts.slice(1).join(" vs ").trim() };
  const at = text.split(/\s+@\s+/);
  if (at.length === 2)
    return { home: at[1].trim(), away: at[0].trim() };
  return { home: text || "Home", away: "Away" };
}

async function gammaGet(path) {
  const res = await fetch(`${GAMMA}${path}`);
  if (!res.ok)
    throw new Error(`Gamma ${res.status} ${path}`);
  return res.json();
}

async function pfGet(url) {
  const headers = { Accept: "application/json" };
  if (PF_KEY)
    headers["x-api-key"] = PF_KEY;
  const res = await fetch(url, { headers });
  if (!res.ok)
    throw new Error(`PF ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchPmSportsMeta() {
  const sports = await gammaGet("/sports");
  const rows = Array.isArray(sports) ? sports : [];
  const out = {};
  for (const key of PM_LEAGUES) {
    const row = rows.find(r => String(r.sport || "").toLowerCase() === key);
    out[key] = row
      ? { series: String(row.series || ""), tags: String(row.tags || ""), id: row.id }
      : null;
  }
  return out;
}

function parseJsonArray(value) {
  if (Array.isArray(value))
    return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value.trim());
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
    }
    catch {
      return [];
    }
  }
  return [];
}

function marketTypeOf(m) {
  return String(m.sportsMarketType ?? m.sports_market_type ?? "").toLowerCase();
}

function isOpenMarket(m) {
  if (m.active === false || m.closed)
    return false;
  if (m.accepting_orders === false || m.acceptingOrders === false)
    return false;
  return true;
}

async function fetchPmLeagueEvents(league, seriesId) {
  const now = Date.now();
  const events = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      closed: "false",
      limit: "200",
      order: "startTime",
      ascending: "true",
      start_time_min: new Date(now - PAST_MS).toISOString(),
      start_time_max: new Date(now + FUTURE_MS).toISOString(),
    });
    params.append("series_id", seriesId);
    if (cursor)
      params.set("after_cursor", cursor);
    const data = await gammaGet(`/events/keyset?${params}`);
    const batch = Array.isArray(data?.events) ? data.events
      : Array.isArray(data?.data) ? data.data
        : Array.isArray(data) ? data : [];
    for (const raw of batch) {
      const title = String(raw.title ?? "").trim();
      if (!title)
        continue;
      if (/\b(halftime|1st half|2nd half|map\s*\d)\b/i.test(title))
        continue;
      const open = (raw.markets ?? []).filter(isOpenMarket);
      const ml = open.find(m => marketTypeOf(m) === "moneyline" && parseJsonArray(m.outcomes).length >= 2);
      if (!ml)
        continue;
      const teams = splitTitleTeams(title);
      const startMs = (() => {
        const rawT = raw.startTime ?? raw.startDate;
        const n = Number(rawT);
        if (Number.isFinite(n) && n > 0)
          return n > 1e12 ? n : n * 1000;
        const p = Date.parse(String(rawT || ""));
        return Number.isFinite(p) ? p : 0;
      })();
      events.push({
        venue: "Polymarket",
        league,
        id: String(raw.id ?? raw.slug ?? title),
        title,
        home: teams.home,
        away: teams.away,
        startMs,
        startIso: startMs ? new Date(startMs).toISOString() : "",
        pair: pairKey(teams.home, teams.away),
        hour: hourBucket(startMs),
      });
    }
    cursor = String(data?.next_cursor || data?.cursor || data?.after_cursor || "");
    if (!cursor || !batch.length)
      break;
  }
  return events;
}

async function fetchPfCategories() {
  const byId = new Map();
  // 官方：棒球 SPORTS_TEAM_MATCH + tag 142/143；再补一页无 tag 的 TEAM_MATCH 看漏网
  const queries = [
    { marketVariant: "SPORTS_TEAM_MATCH", tagIds: "142,143" },
    { marketVariant: "SPORTS_TEAM_MATCH", tagIds: "" },
    { marketVariant: "SPORTS_MATCH", tagIds: "142,143" },
  ];
  for (const q of queries) {
    let after;
    for (let page = 0; page < 8; page += 1) {
      const qs = new URLSearchParams({
        first: "50",
        status: "OPEN",
        marketVariant: q.marketVariant,
      });
      if (q.tagIds)
        qs.set("tagIds", q.tagIds);
      if (after)
        qs.set("after", after);
      const res = await pfGet(`${PF_API}/v1/categories?${qs}`);
      const batch = Array.isArray(res?.data) ? res.data : [];
      for (const row of batch) {
        const id = String(row?.id ?? row?.slug ?? "");
        if (id && !byId.has(id))
          byId.set(id, { ...row, _query: q });
      }
      after = res?.cursor ? String(res.cursor) : undefined;
      if (!after || !batch.length)
        break;
    }
  }
  return [...byId.values()];
}

function inferPfLeague(cat) {
  const tags = (cat.tags ?? []).map(t => String(t.name || "").toLowerCase());
  const leagues = (cat.teams ?? []).map(t => String(t.league || "").toLowerCase());
  const blob = [...tags, ...leagues, String(cat.title || ""), String(cat.slug || "")].join(" ");
  if (/\bkbo\b|korea|korean/.test(blob))
    return "kbo";
  if (/\bnpb\b|nippon|japan(ese)?\s*baseball|中央|セ・リーグ|パ・リーグ/.test(blob))
    return "npb";
  if (/\bcpbl\b|taiwan|中华|中華|中职/.test(blob))
    return "cpbl";
  if (/\bcuba\b|cuban/.test(blob))
    return "cuba";
  if (/\bmlb\b|major league baseball/.test(blob))
    return "mlb";
  if (/\bbaseball\b/.test(blob))
    return "baseball?";
  return "other";
}

function pfTeams(cat) {
  const teams = (cat.teams ?? []).map(t => String(t.name || "").trim()).filter(Boolean);
  if (teams.length >= 2)
    return { home: teams[0], away: teams[1] };
  // single moneyline dual outcomes
  for (const m of cat.markets ?? []) {
    const outs = (m.outcomes ?? []).filter(o => o.team?.name || o.name);
    if (outs.length >= 2) {
      return {
        home: String(outs[0].team?.name || outs[0].name || "").trim(),
        away: String(outs[1].team?.name || outs[1].name || "").trim(),
      };
    }
  }
  return splitTitleTeams(cat.title || cat.slug || "");
}

function summarizePm(events) {
  const byLeague = {};
  for (const e of events) {
    byLeague[e.league] = (byLeague[e.league] || 0) + 1;
  }
  return byLeague;
}

function matchOverlap(pmEvents, pfEvents) {
  const pfByPair = new Map();
  for (const e of pfEvents) {
    const list = pfByPair.get(e.pair) || [];
    list.push(e);
    pfByPair.set(e.pair, list);
  }
  const matched = [];
  const pmOnly = [];
  const usedPf = new Set();
  for (const pm of pmEvents) {
    const cands = pfByPair.get(pm.pair) || [];
    let best = null;
    for (const pf of cands) {
      if (usedPf.has(pf.id))
        continue;
      const dh = Math.abs((pm.hour || 0) - (pf.hour || 0));
      if (dh <= 2) {
        best = pf;
        break;
      }
      if (!best)
        best = pf;
    }
    if (best) {
      usedPf.add(best.id);
      matched.push({
        pmLeague: pm.league,
        pfLeague: best.league,
        pmTitle: pm.title,
        pfTitle: best.title,
        pmStart: pm.startIso,
        pfStart: best.startIso,
        hourDelta: Math.abs((pm.hour || 0) - (best.hour || 0)),
      });
    }
    else {
      pmOnly.push(pm);
    }
  }
  const pfOnly = pfEvents.filter(e => !usedPf.has(e.id));
  return { matched, pmOnly, pfOnly };
}

function topTeams(events, n = 15) {
  const c = new Map();
  for (const e of events) {
    for (const t of [e.home, e.away]) {
      const k = normTeam(t) || t;
      c.set(k, (c.get(k) || 0) + 1);
    }
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  console.log("=== fetch PM /sports meta ===");
  const meta = await fetchPmSportsMeta();
  console.log(meta);

  console.log("=== fetch PM events per league ===");
  const pmEvents = [];
  for (const league of PM_LEAGUES) {
    const series = meta[league]?.series;
    if (!series) {
      console.warn(`skip ${league}: no series`);
      continue;
    }
    const rows = await fetchPmLeagueEvents(league, series);
    console.log(`PM ${league}: ${rows.length} moneyline events (series=${series})`);
    pmEvents.push(...rows);
  }

  console.log("=== fetch PF categories ===");
  const cats = await fetchPfCategories();
  console.log(`PF raw categories: ${cats.length}`);

  const pfEvents = [];
  const tagHist = new Map();
  const variantHist = new Map();
  for (const cat of cats) {
    for (const t of cat.tags ?? []) {
      const n = String(t.name || "");
      tagHist.set(n, (tagHist.get(n) || 0) + 1);
    }
    const v = String(cat.marketVariant || "?");
    variantHist.set(v, (variantHist.get(v) || 0) + 1);
    const tagsLower = new Set((cat.tags ?? []).map(t => String(t.name || "").toLowerCase()));
    const looksBaseball = tagsLower.has("mlb") || tagsLower.has("baseball")
      || /\b(mlb|kbo|npb|cpbl|baseball)\b/i.test(String(cat.title || ""))
      || (cat.teams ?? []).some(t => /\b(mlb|kbo|npb|cpbl|baseball)\b/i.test(String(t.league || "")));
    if (!looksBaseball)
      continue;
    const { home, away } = pfTeams(cat);
    if (!home || !away || home === away)
      continue;
    const startMs = cat.startsAt ? Date.parse(cat.startsAt) : 0;
    const league = inferPfLeague(cat);
    pfEvents.push({
      venue: "PredictFun",
      league,
      id: String(cat.id ?? cat.slug),
      title: String(cat.title || cat.slug || ""),
      home,
      away,
      startMs: Number.isFinite(startMs) ? startMs : 0,
      startIso: Number.isFinite(startMs) && startMs ? new Date(startMs).toISOString() : "",
      pair: pairKey(home, away),
      hour: hourBucket(startMs),
      tags: (cat.tags ?? []).map(t => t.name),
      variant: cat.marketVariant,
      teamLeagues: [...new Set((cat.teams ?? []).map(t => t.league).filter(Boolean))],
    });
  }

  const overlap = matchOverlap(pmEvents, pfEvents);
  const report = {
    fetchedAt: new Date().toISOString(),
    window: { pastHours: 24, futureDays: 7 },
    pmMeta: meta,
    pmCountsByLeague: summarizePm(pmEvents),
    pmTotal: pmEvents.length,
    pfRawCategories: cats.length,
    pfBaseballEvents: pfEvents.length,
    pfCountsByInferredLeague: summarizePm(pfEvents),
    pfTagHistogram: Object.fromEntries([...tagHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)),
    pfVariantHistogram: Object.fromEntries(variantHist),
    overlap: {
      matched: overlap.matched.length,
      matchedPctOfPm: pmEvents.length ? +(overlap.matched.length / pmEvents.length * 100).toFixed(1) : 0,
      matchedPctOfPf: pfEvents.length ? +(overlap.matched.length / pfEvents.length * 100).toFixed(1) : 0,
      matchedByPmLeague: summarizePm(overlap.matched.map(m => ({ league: m.pmLeague }))),
      matchedCrossLeague: overlap.matched.filter(m => m.pmLeague !== m.pfLeague && m.pfLeague !== "baseball?").length,
      pmOnly: overlap.pmOnly.length,
      pfOnly: overlap.pfOnly.length,
      pmOnlyByLeague: summarizePm(overlap.pmOnly),
      pfOnlyByLeague: summarizePm(overlap.pfOnly),
    },
    samples: {
      matched: overlap.matched.slice(0, 12),
      pmOnlyMlb: overlap.pmOnly.filter(e => e.league === "mlb").slice(0, 8).map(e => ({
        title: e.title, start: e.startIso, league: e.league,
      })),
      pmOnlyNonMlb: overlap.pmOnly.filter(e => e.league !== "mlb").slice(0, 12).map(e => ({
        title: e.title, start: e.startIso, league: e.league,
      })),
      pfOnly: overlap.pfOnly.slice(0, 12).map(e => ({
        title: e.title, start: e.startIso, league: e.league, tags: e.tags, teamLeagues: e.teamLeagues,
      })),
      pmTopTeams: topTeams(pmEvents),
      pfTopTeams: topTeams(pfEvents),
    },
  };

  const outPath = resolve("devtools/tmp-baseball-pm-pf-compare-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({
    pmTotal: report.pmTotal,
    pmCountsByLeague: report.pmCountsByLeague,
    pfBaseballEvents: report.pfBaseballEvents,
    pfCountsByInferredLeague: report.pfCountsByInferredLeague,
    overlap: report.overlap,
  }, null, 2));
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
