/**
 * Phase 0：足球合并质量抽检（只读）。
 * 默认直调 store.buildFootballMatchList（与 API 同路径）：
 *   cd server/backend && node scripts/ops/diagnostics/audit-football-merge-coverage.mjs
 * HTTP（需 token）：
 *   AUDIT_MODE=http ESPORT_TEST_BASE=http://47.57.10.202 ESPORT_TOKEN=... node ...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../../..");
loadDotenv({ path: path.join(backendRoot, ".env") });

const mode = String(process.env.AUDIT_MODE || "store").toLowerCase();
const base = String(process.env.ESPORT_TEST_BASE || "http://127.0.0.1:3560").replace(/\/$/, "");
const token = String(process.env.ESPORT_TOKEN || "").trim();
const outPath = process.env.AUDIT_OUT
  || path.resolve(backendRoot, "../../tmp_fb_merge_audit.json");

function marketKey(bet) {
  const code = String(bet?.MarketCode || bet?.marketCode || "moneyline").toLowerCase();
  const line = bet?.Line ?? bet?.line;
  if (code === "moneyline" || line == null || line === "")
    return `${code}:`;
  const n = Number(line);
  const lineStr = Number.isFinite(n) ? String(n) : String(line);
  return `${code}:${lineStr}`;
}

function venueSet(bet) {
  const sources = bet?.Sources || {};
  return Object.keys(sources).filter(Boolean).sort();
}

async function fetchFootballHttp() {
  const url = `${base}/esport/Client_GetFootballMatchs`;
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (token)
    headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: "" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  }
  catch {
    throw new Error(`non-json ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!json || Number(json.success) !== 1) {
    throw new Error(`API fail success=${json?.success} msg=${json?.msg || json?.message || ""}`);
  }
  return Array.isArray(json.info) ? json.info : [];
}

async function fetchFootballStore() {
  const store = await import("../../../core/esport-api/store.js");
  const rows = await store.buildFootballMatchList();
  return Array.isArray(rows) ? rows : [];
}

function audit(rows) {
  const byGame = {};
  let dualVenueMatches = 0;
  let dualVenueWithSpreadOrTotal = 0;
  let dualVenueBothSidesOnSameLine = 0;
  const chiDetails = [];
  const gaps = [];

  for (const m of rows) {
    const game = String(m.Game || m.game || "?").toLowerCase();
    byGame[game] ||= {
      matches: 0,
      dualVenue: 0,
      dualWithProps: 0,
      dualSameLine: 0,
      singleVenue: 0,
    };
    byGame[game].matches += 1;

    const venues = Object.keys(m.Matchs || m.matchs || {}).sort();
    const isDual = venues.includes("Polymarket") && venues.includes("PredictFun");
    if (isDual) {
      dualVenueMatches += 1;
      byGame[game].dualVenue += 1;
    }
    else {
      byGame[game].singleVenue += 1;
    }

    const bets = Array.isArray(m.Bets || m.bets) ? (m.Bets || m.bets) : [];
    const propBets = bets.filter((b) => {
      const c = String(b.MarketCode || "").toLowerCase();
      return c === "spreads" || c === "totals";
    });

    const lineMap = new Map();
    for (const b of propBets) {
      lineMap.set(marketKey(b), venueSet(b));
    }

    const sameLineDual = [...lineMap.entries()].filter(([, vs]) =>
      vs.includes("Polymarket") && vs.includes("PredictFun"));
    const hasAnyProp = propBets.length > 0;
    const hasDualPropLine = sameLineDual.length > 0;

    if (isDual && hasAnyProp) {
      dualVenueWithSpreadOrTotal += 1;
      byGame[game].dualWithProps += 1;
    }
    if (hasDualPropLine) {
      dualVenueBothSidesOnSameLine += 1;
      byGame[game].dualSameLine += 1;
    }

    if (game === "chi") {
      chiDetails.push({
        id: m.ID ?? m.id,
        title: m.Title || m.title,
        startAt: m.StartAt || m.startAt || m.StartTime,
        venues,
        propLines: [...lineMap.entries()].map(([k, vs]) => ({ line: k, venues: vs })),
        dualSameLines: sameLineDual.map(([k]) => k),
      });
      if (isDual && hasAnyProp && !hasDualPropLine) {
        gaps.push({
          kind: "chi_dual_match_but_no_shared_prop_line",
          id: m.ID ?? m.id,
          title: m.Title || m.title,
          propLines: [...lineMap.entries()].map(([k, vs]) => ({ line: k, venues: vs })),
        });
      }
      if (!isDual && hasAnyProp) {
        gaps.push({
          kind: "chi_props_but_single_venue_match",
          id: m.ID ?? m.id,
          title: m.Title || m.title,
          venues,
          propLines: [...lineMap.entries()].map(([k, vs]) => ({ line: k, venues: vs })),
        });
      }
    }
  }

  return {
    asOf: new Date().toISOString(),
    mode,
    base: mode === "http" ? base : "store.buildFootballMatchList",
    totalMatches: rows.length,
    dualVenueMatches,
    dualVenueWithSpreadOrTotal,
    dualVenueBothSidesOnSameLine,
    byGame,
    chiDetails,
    gaps,
    detectUniverseNote:
      "N4 detect targets shared spreads|totals lines on dual-venue matches; PF props are mostly CSL (chi).",
  };
}

const rows = mode === "http" ? await fetchFootballHttp() : await fetchFootballStore();
const report = audit(rows);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  asOf: report.asOf,
  mode: report.mode,
  base: report.base,
  totalMatches: report.totalMatches,
  dualVenueMatches: report.dualVenueMatches,
  dualVenueWithSpreadOrTotal: report.dualVenueWithSpreadOrTotal,
  dualVenueBothSidesOnSameLine: report.dualVenueBothSidesOnSameLine,
  byGame: report.byGame,
  chiMatchCount: report.chiDetails.length,
  gapCount: report.gaps.length,
  gaps: report.gaps.slice(0, 30),
  chiSample: report.chiDetails.slice(0, 10).map(c => ({
    title: c.title,
    venues: c.venues,
    dualSameLines: c.dualSameLines,
    propLineCount: c.propLines.length,
  })),
  outPath,
}, null, 2));
