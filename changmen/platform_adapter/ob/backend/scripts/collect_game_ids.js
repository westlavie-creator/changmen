#!/usr/bin/env node
/**
 * 浠?OB game/index + CDN pc.json 鏀堕泦 game_id锛屽悎骞跺埌 ob_game_ids.json锛堜粎琛ュ厖 hints锛屼笉瑕嗙洊宸查獙璇佸悕绉帮級
 *
 * Usage: node platforms/ob/scripts/collect_game_ids.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Core = require("../core.js");
const { login, obGet } = require("../session.js");

const OUT = path.join(__dirname, "../data/ob_game_ids.json");
const PC_JSON = "https://uphw-cdn3.jomscxu.com/upload/json/pc.json";

function cleanLeague(name) {
  return String(name || "").replace(/&nbsp;/g, " ").trim();
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const session = await login();
  const index = await obGet(
    session.gateway,
    "/game/index?game_id=0&flag=1&day=1",
    session.token,
    session.lang
  );
  const matches = Core.normalizeGameIndex(index.json);

  const live = {};
  for (const m of matches) {
    const id = String(m.gameId);
    if (!live[id]) live[id] = { count: 0, leagues: new Set() };
    live[id].count += 1;
    live[id].leagues.add(cleanLeague(m.raw?.tournament_cn_name).slice(0, 48));
  }

  let pcIds = [];
  try {
    const res = await fetch(PC_JSON);
    const pc = await res.json();
    pcIds = Object.keys(pc.game_imag || {});
  } catch (err) {
    console.warn("pc.json fetch failed:", err.message);
  }

  const allIds = new Set([...Object.keys(catalog.games), ...pcIds, ...Object.keys(live)]);

  for (const id of allIds) {
    if (!catalog.games[id]) {
      catalog.games[id] = {
        name: "寰呯‘璁?,
        nameEn: "Unknown",
        code: "unknown",
        verified: false,
        hints: [],
      };
    }
    const rec = catalog.games[id];
    const leagues = live[id] ? [...live[id].leagues] : [];
    const merged = new Set([...(rec.hints || []), ...leagues]);
    rec.hints = [...merged].slice(0, 8);
    if (live[id]) rec.liveMatchCount = live[id].count;
    rec.inCdn = pcIds.includes(id);
  }

  catalog.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  const verified = Object.values(catalog.games).filter((g) => g.verified).length;
  console.log(
    JSON.stringify(
      {
        total: allIds.size,
        verified,
        liveGames: Object.keys(live).length,
        output: OUT,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
