import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../apps/backend/.env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) {
  console.log(JSON.stringify({ error: "NO_SUPABASE" }));
  process.exit(0);
}

const sb = createClient(url, key);
const needle = process.argv[2] || "RUBY";

const { data: cms, error: e1 } = await sb
  .from("client_matches")
  .select("id,title,game,bo,round,start_time,matchs,bets")
  .or(`title.ilike.%${needle}%,title.ilike.%Ares%`);
if (e1) throw e1;

const hits = (cms || []).filter((cm) =>
  /ruby/i.test(cm.title || "") && /ares/i.test(cm.title || ""),
);

  for (const cm of hits) {
  const { data: pms } = await sb
    .from("platform_matches")
    .select("platform,source_match_id,match_id")
    .eq("match_id", cm.id);
  console.log("platform_matches with match_id", cm.id, JSON.stringify(pms));
  for (const [plat, sid] of Object.entries(cm.matchs || {})) {
    const { data: pm } = await sb
      .from("platform_matches")
      .select("match_id,home,away")
      .eq("platform", plat)
      .eq("source_match_id", String(sid))
      .maybeSingle();
    console.log(`  ${plat}:${sid} match_id=${pm?.match_id ?? "null"}`);
  }
  const maps = [...new Set((cm.bets || []).map((b) => b.Map))].sort((a, b) => a - b);
  console.log("=== client_match", cm.id, cm.title);
  console.log("game", cm.game, "bo", cm.bo, "round", cm.round);
  console.log("start", new Date(cm.start_time).toISOString());
  console.log("platforms", JSON.stringify(cm.matchs));
  console.log("bet maps", maps.join(", "));
  for (const b of cm.bets || []) {
    console.log(`  Map ${b.Map}: ${b.Name} sources=[${Object.keys(b.Sources || {}).join(",")}]`);
  }

  for (const [platform, sourceMatchId] of Object.entries(cm.matchs || {})) {
    const { data: rows, error: e2 } = await sb
      .from("platform_bets")
      .select("map,bet_name,source_bet_id,is_locked,updated_at")
      .eq("platform", platform)
      .eq("source_match_id", String(sourceMatchId));
    if (e2) {
      console.log(`platform_bets ${platform} error`, e2.message);
      continue;
    }
    const arr = rows || [];
    const byMap = new Map();
    for (const bet of arr) {
      const m = bet.Map ?? 0;
      if (!byMap.has(m)) byMap.set(m, []);
      byMap.get(m).push(bet.bet_name || "?");
    }
    console.log(`--- platform_bets ${platform}:${sourceMatchId} (${arr.length} rows)`);
    for (const [m, names] of [...byMap.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  Map ${m}: ${names.slice(0, 5).join(" | ")}`);
    }
  }
}

if (hits.length === 1 && process.argv.includes("--timing")) {
  const cm = hits[0];
  console.log("client built_at", cm.built_at ?? "(from select)", new Date(cm.start_time).toISOString());
  const { data: cmRow } = await sb.from("client_matches").select("built_at").eq("id", cm.id).single();
  console.log("client built_at", cmRow?.built_at, new Date(cmRow.built_at).toISOString());
  for (const [platform, sid] of Object.entries(cm.matchs || {})) {
    const { data: m3 } = await sb
      .from("platform_bets")
      .select("updated_at")
      .eq("platform", platform)
      .eq("source_match_id", String(sid))
      .eq("map", 3)
      .maybeSingle();
    console.log(`${platform} map3 updated_at`, m3?.updated_at ? new Date(m3.updated_at).toISOString() : "none");
  }
}

if (hits.length === 1 && process.argv.includes("--rebuild-preview")) {
  const {
    buildClientMatchList,
    applyManualMatchLinks,
    normalizeMatchesShape,
  } = await import("../packages/match-engine/merge/match_merge.js");
  const { resolveClientMatchIds } = await import("../packages/match-engine/ids/client_match_ids.js");
  const { fetchPlatformMatches, fetchPlatformBets, fetchLiveTimers, fetchClientMatches } =
    await import("../packages/shared/db/supabase.js");
  const { formatOdds } = await import("../packages/shared/odds_format.js");

  const sourceFromBet = (provider, b) => ({
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: formatOdds(b.HomeOdds),
    AwayOdds: formatOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  });

  const [matchesRaw, bets, timers, clientRows] = await Promise.all([
    fetchPlatformMatches(),
    fetchPlatformBets(),
    fetchLiveTimers(),
    fetchClientMatches(),
  ]);
  const matches = normalizeMatchesShape(matchesRaw);
  let info = buildClientMatchList({ matches, bets, timers, sourceFromBet });
  info = await resolveClientMatchIds(sb, info, { matches });
  info = applyManualMatchLinks(info, matches, bets, timers, sourceFromBet, clientRows);

  const cm = hits[0];
  const row = info.find((m) => Number(m.ID) === Number(cm.id));
  if (!row) {
    console.log("rebuild-preview: match id", cm.id, "not found in rebuilt list");
    console.log(
      "near titles",
      info.filter((m) => /ruby|ares/i.test(m.Title)).map((m) => ({ id: m.ID, title: m.Title, maps: m.Bets?.map((b) => b.Map) })),
    );
  } else {
    console.log("rebuild-preview id", row.ID, row.Title);
    console.log("matchs", JSON.stringify(row.Matchs));
    for (const b of row.Bets || []) {
      console.log(`  Map ${b.Map}: ${b.Name} [${Object.keys(b.Sources || {}).join(",")}]`);
    }
    const map3Rows = info.filter((m) => (m.Bets || []).some((b) => b.Map === 3));
    console.log(
      "matches with map3:",
      map3Rows.map((m) => ({
        id: m.ID,
        title: m.Title,
        matchs: m.Matchs,
        maps: m.Bets?.map((b) => `${b.Map}:${Object.keys(b.Sources || {}).join("+")}`),
      })),
    );
  }

  let auto = buildClientMatchList({ matches, bets, timers, sourceFromBet });
  const autoRuby = auto.filter((m) => /ruby|ares/i.test(m.Title || ""));
  console.log(
    "auto-merge ruby/ares rows:",
    autoRuby.map((m) => ({ title: m.Title, matchs: m.Matchs, maps: m.Bets?.map((b) => b.Map) })),
  );
  const autoRow = auto.find((m) => Object.values(m.Matchs || {}).includes("4278240509563586"));
  console.log(
    "auto-merge row containing OB 4278240509563586:",
    autoRow
      ? { title: autoRow.Title, matchs: autoRow.Matchs, maps: autoRow.Bets?.map((b) => b.Map) }
      : "none",
  );
  const obSingle = auto.find((m) => m.Matchs?.OB === "4278240509563586" && Object.keys(m.Matchs).length === 1);
  console.log(
    "OB-only auto row:",
    obSingle ? { title: obSingle.Title, maps: obSingle.Bets?.map((b) => b.Map) } : "none",
  );
}

if (hits.length === 1 && process.argv.includes("--simulate-ob")) {
  const { buildBetsForMatch } = await import("../packages/match-engine/merge/bet_builder.js");
  const { describePlatformGame } = await import("../packages/shared/catalog/game_catalog.mjs");
  const { formatOdds } = await import("../packages/shared/odds_format.js");
  const src = (p, b) => ({
    Type: p,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: formatOdds(b.HomeOdds),
    AwayOdds: formatOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  });
  const cm = hits[0];
  const obId = cm.matchs?.OB;
  const { data: rows } = await sb
    .from("platform_bets")
    .select("*")
    .eq("platform", "OB")
    .eq("source_match_id", String(obId));
  const key = `OB:${obId}`;
  const bets = {
    [key]: {
      provider: "OB",
      matchId: obId,
      bets: (rows || []).map((r) => ({
        SourceBetID: r.source_bet_id,
        BetName: r.bet_name,
        Map: r.map,
        SourceHomeID: r.source_home_id,
        SourceAwayID: r.source_away_id,
        HomeOdds: r.home_odds,
        AwayOdds: r.away_odds,
        Status: r.is_locked ? "Locked" : "Normal",
      })),
    },
  };
  const { data: pm } = await sb
    .from("platform_matches")
    .select("source_game_id,game")
    .eq("platform", "OB")
    .eq("source_match_id", String(obId))
    .maybeSingle();
  const g = describePlatformGame("OB", pm?.source_game_id);
  const out = buildBetsForMatch("OB", obId, cm.id, bets, src, g.gameCode);
  console.log("simulate OB buildBetsForMatch gameCode=", g.gameCode);
  for (const b of out) console.log(" ", b.Map, b.Name);
}

if (!hits.length) {
  console.log("No client_match for", needle);
  const { data: pms } = await sb
    .from("platform_matches")
    .select("platform,source_match_id,home,away,start_time,game,match_id")
    .or("home.ilike.%RUBY%,away.ilike.%RUBY%,home.ilike.%Ares%,away.ilike.%Ares%")
    .limit(30);
  console.log("platform_matches sample:", JSON.stringify(pms, null, 2));
}
