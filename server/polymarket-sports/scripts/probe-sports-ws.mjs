#!/usr/bin/env node
/**
 * 探针：Polymarket Sports WS score 推送频率与格式
 * 用法：node scripts/probe-sports-ws.mjs [seconds] [gameId]
 */
import WebSocket from "ws";

const SPORTS_WS = "wss://sports-api.polymarket.com/ws";
const DURATION_MS = (Number(process.argv[2]) || 90) * 1000;
const FILTER_GAME_ID = process.argv[3] ? Number(process.argv[3]) : null;

/** @type {Map<number, { count: number, scores: Set<string>, last: object }>} */
const byGameId = new Map();
let total = 0;
let esports = 0;
let withNonPlaceholderInMap = 0;
const samples = [];

function parseInMap(score) {
  return String(score || "").split("|")[0] || "";
}

function isEsports(msg) {
  const slug = String(msg.slug || "").toLowerCase();
  const title = `${msg.homeTeam || ""} ${msg.awayTeam || ""}`.toLowerCase();
  if (/^(cs2|val|lol|dota|hok)-/.test(slug))
    return true;
  if (msg.leagueAbbreviation && /cs2|val|lol|dota|hok/i.test(String(msg.leagueAbbreviation)))
    return true;
  return false;
}

function isNonPlaceholderInMap(inMap) {
  const s = String(inMap || "").trim();
  if (!s || s === "000-000" || s === "0-0")
    return false;
  const nums = s.split("-").map(v => Number.parseInt(v, 10));
  return nums.length >= 2 && nums.every(n => Number.isFinite(n)) && (nums[0] > 0 || nums[1] > 0);
}

function note(msg) {
  total += 1;
  const gid = Number(msg.gameId);
  if (!Number.isFinite(gid))
    return;
  if (FILTER_GAME_ID != null && gid !== FILTER_GAME_ID)
    return;

  const inMap = parseInMap(msg.score);
  const row = byGameId.get(gid) || { count: 0, scores: new Set(), last: null };
  row.count += 1;
  if (msg.score)
    row.scores.add(String(msg.score));
  row.last = msg;
  byGameId.set(gid, row);

  if (isEsports(msg))
    esports += 1;
  if (isNonPlaceholderInMap(inMap)) {
    withNonPlaceholderInMap += 1;
    samples.push({
      ts: new Date().toISOString(),
      gameId: gid,
      slug: msg.slug,
      score: msg.score,
      period: msg.period,
      status: msg.status,
      teams: `${msg.homeTeam || ""} vs ${msg.awayTeam || ""}`,
    });
  }
}

console.log(`[probe] connect ${SPORTS_WS} for ${DURATION_MS / 1000}s` +
  (FILTER_GAME_ID ? ` filter gameId=${FILTER_GAME_ID}` : ""));

const ws = new WebSocket(SPORTS_WS);
ws.on("open", () => console.log("[probe] connected"));
ws.on("message", (data) => {
  const s = String(data);
  if (s === "ping") {
    ws.send("pong");
    return;
  }
  try {
    note(JSON.parse(s));
  }
  catch { /* ignore */ }
});
ws.on("error", (err) => console.warn("[probe] error:", err.message));

setTimeout(() => {
  ws.close();
  console.log("\n=== summary ===");
  console.log(JSON.stringify({
    totalMessages: total,
    uniqueGameIds: byGameId.size,
    esportsMessages: esports,
    nonPlaceholderInMapMessages: withNonPlaceholderInMap,
  }, null, 2));

  if (samples.length) {
    console.log("\n=== non-placeholder in-map samples ===");
    for (const row of samples.slice(0, 20))
      console.log(JSON.stringify(row));
  }
  else {
    console.log("\n(no messages with non-zero in-map score segment)");
  }

  const esportsRows = [...byGameId.entries()]
    .filter(([, v]) => isEsports(v.last))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  console.log("\n=== esports gameIds (top by msg count) ===");
  for (const [gid, row] of esportsRows) {
    const last = row.last;
    console.log(JSON.stringify({
      gameId: gid,
      msgCount: row.count,
      slug: last?.slug,
      lastScore: last?.score,
      period: last?.period,
      status: last?.status,
      distinctScores: [...row.scores].slice(0, 8),
    }));
  }

  process.exit(0);
}, DURATION_MS);
