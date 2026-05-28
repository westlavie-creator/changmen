/**
 * 修复已落库 IM：Map 重算、盘口去重、A8 时间规则、从 OB 补队名/游戏类型
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  normalizeImBet,
  imBetNameIsCollectible,
} = require("../gamebet_backend/shared/im_parse.js");
const {
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
  a8StartTimeListAllowed,
} = require("../gamebet_backend/shared/a8_match_time.js");
const {
  getGameCodeForPlatformId,
  getPlatformGameId,
} = require("../gamebet_backend/shared/game_catalog.js");

const dataDir = path.join(__dirname, "../gamebet_backend/data/esport");
const betsPath = path.join(dataDir, "bets.json");
const matchesPath = path.join(dataDir, "matches.json");

const ENRICH_MS = 3 * 60 * 60 * 1000;
const now = Date.now();

function isPlaceholder(name) {
  const t = String(name || "").trim();
  return !t || t === "主队" || t === "客队" || t === "Unknown";
}

function buildEnrichIndex(matches) {
  const rows = [];
  for (const [provider, byId] of Object.entries(matches)) {
    if (provider === "IM" || !byId) continue;
    for (const m of Object.values(byId)) {
      if (isPlaceholder(m.Home) || isPlaceholder(m.Away)) continue;
      const teams = Array.isArray(m.Teams) ? m.Teams : [];
      const nativeGameId = String(m.SourceGameID || "").trim();
      const gameCode = getGameCodeForPlatformId(provider, nativeGameId);
      const imSourceGameId = gameCode ? getPlatformGameId("IM", gameCode) : "";
      rows.push({
        start: normalizeEpochMs(m.StartTime),
        home: String(m.Home).trim(),
        away: String(m.Away).trim(),
        homeId: m.HomeID,
        awayId: m.AwayID,
        homeLogo: teams[0]?.Logo || "",
        awayLogo: teams[1]?.Logo || "",
        imSourceGameId: imSourceGameId || "",
      });
    }
  }
  return rows;
}

function enrichIm(match, index) {
  const needTeams = isPlaceholder(match.Home) || isPlaceholder(match.Away);
  const needGame =
    !match.SourceGameID || String(match.SourceGameID).trim() === "unknown";
  if (!needTeams && !needGame) return match;

  const st = normalizeEpochMs(match.StartTime);
  const homeKey = String(match.Home || "").trim().toLowerCase();
  const awayKey = String(match.Away || "").trim().toLowerCase();
  let best = null;

  if (homeKey && awayKey && !needTeams) {
    for (const row of index) {
      const rh = row.home.toLowerCase();
      const ra = row.away.toLowerCase();
      if ((rh === homeKey && ra === awayKey) || (rh === awayKey && ra === homeKey)) {
        best = row;
        break;
      }
    }
  }

  if (!best) {
    let bestGap = ENRICH_MS + 1;
    for (const row of index) {
      if (!st || !row.start) continue;
      const gap = Math.abs(row.start - st);
      if (gap < bestGap) {
        bestGap = gap;
        best = row;
      }
    }
    if (!best || bestGap > ENRICH_MS) return match;
  }

  const home = needTeams && isPlaceholder(match.Home) ? best.home : match.Home;
  const away = needTeams && isPlaceholder(match.Away) ? best.away : match.Away;
  const sourceGameId =
    needGame && best.imSourceGameId ? best.imSourceGameId : match.SourceGameID;
  const startTime =
    st > 0 ? st : best.start > 0 ? best.start : 0;

  return {
    ...match,
    Home: home,
    Away: away,
    SourceGameID: sourceGameId,
    StartTime: startTime,
    Teams: [
      {
        Type: "IM",
        GameID: sourceGameId,
        Name: home,
        TeamID: match.HomeID,
        Logo: best.homeLogo,
      },
      {
        Type: "IM",
        GameID: sourceGameId,
        Name: away,
        TeamID: match.AwayID,
        Logo: best.awayLogo,
      },
    ],
  };
}

function imStale(match, block) {
  const start = normalizeEpochMs(match.StartTime);
  if (start > 0 && !a8StartTimeListAllowed(start)) return true;
  const savedAt = Number(block?.savedAt || match.savedAt) || 0;
  if (savedAt > 0 && now - savedAt > IM_ODDS_ACTIVE_MS) return true;
  return !(block?.bets?.length);
}

const bets = JSON.parse(fs.readFileSync(betsPath, "utf8"));
const matches = JSON.parse(fs.readFileSync(matchesPath, "utf8"));
const enrichIndex = buildEnrichIndex(matches);

let mapFixed = 0;
let deduped = 0;
let prunedMatches = 0;
let collapsed = 0;
let gameFixed = 0;

for (const [key, block] of Object.entries(bets)) {
  if (!key.startsWith("IM:") || !Array.isArray(block?.bets)) continue;
  const byMap = new Map();
  for (const b of block.bets) {
    const name = String(b.BetName || b.name || "");
    if (name && !imBetNameIsCollectible(name)) continue;
    const next = normalizeImBet(b);
    if ((next.Map ?? 0) !== (b.Map ?? 0)) mapFixed++;
    const map = next.Map ?? 0;
    const prev = byMap.get(map);
    if (!prev || String(next.SourceBetID || "") > String(prev.SourceBetID || "")) {
      byMap.set(map, next);
    } else if (prev) {
      deduped++;
    }
  }
  block.bets = [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
  block.savedAt = now;
}

const im = matches.IM || {};
const survivors = [];

for (const [id, raw] of Object.entries(im)) {
  const beforeGame = raw.SourceGameID;
  let match = enrichIm(raw, enrichIndex);
  if (beforeGame === "unknown" && match.SourceGameID && match.SourceGameID !== "unknown") {
    gameFixed++;
  }
  if (
    (isPlaceholder(match.Home) || isPlaceholder(match.Away)) &&
    normalizeEpochMs(match.StartTime) > now - 6 * 60 * 60 * 1000
  ) {
    match.StartTime = 0;
  }
  const block = bets[`IM:${id}`];
  if (
    (isPlaceholder(match.Home) && isPlaceholder(match.Away)) &&
    (!match.SourceGameID || match.SourceGameID === "unknown")
  ) {
    delete bets[`IM:${id}`];
    prunedMatches++;
    continue;
  }
  if (imStale(match, block)) {
    delete bets[`IM:${id}`];
    prunedMatches++;
    continue;
  }
  survivors.push({ id, match, block });
}

const groups = new Map();
for (const row of survivors) {
  const { match, block } = row;
  const placeholder = isPlaceholder(match.Home) || isPlaceholder(match.Away);
  const key = placeholder
    ? `ph:${match.SourceGameID}`
    : `${String(match.Home).trim().toLowerCase()}|${String(match.Away).trim().toLowerCase()}|${match.SourceGameID}`;
  const prev = groups.get(key);
  if (!prev) {
    groups.set(key, row);
    continue;
  }
  const pick =
    (block?.bets?.length || 0) > (prev.block?.bets?.length || 0) ? row : prev;
  const drop = pick === row ? prev : row;
  const mergeInto = pick;
  const mergeFrom = drop;
  for (const b of mergeFrom.block?.bets || []) {
    const map = normalizeImBet(b).Map ?? 0;
    const existing = (mergeInto.block.bets || []).find((x) => (x.Map ?? 0) === map);
    if (!existing) mergeInto.block.bets.push(b);
    else if (String(b.SourceBetID) > String(existing.SourceBetID)) {
      const idx = mergeInto.block.bets.indexOf(existing);
      mergeInto.block.bets[idx] = b;
    }
  }
  mergeInto.block.bets = mergeInto.block.bets
    .map((b) => normalizeImBet(b))
    .sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
  mergeInto.block.savedAt = now;
  if (!isPlaceholder(mergeFrom.match.Home) && isPlaceholder(mergeInto.match.Home)) {
    mergeInto.match.Home = mergeFrom.match.Home;
    mergeInto.match.Away = mergeFrom.match.Away;
  }
  if (
    mergeInto.match.SourceGameID === "unknown" &&
    mergeFrom.match.SourceGameID &&
    mergeFrom.match.SourceGameID !== "unknown"
  ) {
    mergeInto.match.SourceGameID = mergeFrom.match.SourceGameID;
    gameFixed++;
  }
  groups.set(key, mergeInto);
  delete bets[`IM:${drop.id}`];
  collapsed++;
}

const nextIm = {};
for (const { id, match, block } of groups.values()) {
  nextIm[id] = match;
  bets[`IM:${id}`] = block;
}

matches.IM = nextIm;
fs.writeFileSync(betsPath, `${JSON.stringify(bets, null, 2)}\n`, "utf8");
fs.writeFileSync(matchesPath, `${JSON.stringify(matches, null, 2)}\n`, "utf8");
console.log(
  `IM fix: map=${mapFixed}, dedupe=${deduped}, pruned=${prunedMatches}, collapsed=${collapsed}, game=${gameFixed}, left=${Object.keys(nextIm).length}`,
);
