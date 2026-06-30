#!/usr/bin/env node
/**
 * 对比同一 gameId：Sports WS 推送 vs Gamma REST 的 score/period 更新频率
 * 用法：node scripts/compare-ws-gamma.mjs <eventId> <gameId> [seconds]
 */
import WebSocket from "ws";

const eventId = process.argv[2];
const gameId = Number(process.argv[3]);
const SEC = (Number(process.argv[4]) || 180) * 1000;
const GAMMA = "https://gamma-api.polymarket.com";

if (!eventId || !Number.isFinite(gameId)) {
  console.error("usage: node scripts/compare-ws-gamma.mjs <eventId> <gameId> [seconds]");
  process.exit(1);
}

/** @type {Array<{src:string,ts:string,score?:string,period?:string,live?:boolean,ended?:boolean}>} */
const log = [];

function row(src, data) {
  const entry = {
    src,
    ts: new Date().toISOString(),
    score: data.score,
    period: data.period,
    live: data.live,
    ended: data.ended,
  };
  log.push(entry);
  console.log(JSON.stringify(entry));
}

async function pollGamma() {
  try {
    const e = await (await fetch(`${GAMMA}/events/${eventId}`, {
      signal: AbortSignal.timeout(15_000),
    })).json();
    row("gamma", {
      score: e.score,
      period: e.period,
      live: e.live,
      ended: e.ended,
    });
  }
  catch (err) {
    console.warn("[gamma] err:", err.message);
  }
}

console.log(`[compare] event=${eventId} gameId=${gameId} for ${SEC / 1000}s`);

await pollGamma();
const gammaTimer = setInterval(pollGamma, 10_000);

const ws = new WebSocket("wss://sports-api.polymarket.com/ws");
ws.on("message", (data) => {
  const s = String(data);
  if (s === "ping") {
    ws.send("pong");
    return;
  }
  try {
    const msg = JSON.parse(s);
    if (Number(msg.gameId) === gameId) {
      row("ws", {
        score: msg.score,
        period: msg.period,
        live: msg.live,
        ended: msg.ended,
      });
    }
  }
  catch { /* ignore */ }
});

setTimeout(() => {
  clearInterval(gammaTimer);
  ws.close();
  const wsRows = log.filter(r => r.src === "ws");
  const gammaRows = log.filter(r => r.src === "gamma");
  console.log("\n=== summary ===");
  console.log(JSON.stringify({
    wsUpdates: wsRows.length,
    gammaPolls: gammaRows.length,
    wsDistinctScores: [...new Set(wsRows.map(r => r.score).filter(Boolean))],
    gammaDistinctScores: [...new Set(gammaRows.map(r => r.score).filter(Boolean))],
    wsDistinctPeriods: [...new Set(wsRows.map(r => r.period).filter(Boolean))],
    gammaDistinctPeriods: [...new Set(gammaRows.map(r => r.period).filter(Boolean))],
  }, null, 2));
  process.exit(0);
}, SEC);
