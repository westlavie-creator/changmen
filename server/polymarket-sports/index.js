/**
 * VPS：Polymarket Sports WS → client_matches.pm_sport
 * 不改动浏览器 CLOB 采集 / saveMatch / saveBets。
 */

import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { updateClientMatchPmSport } from "@changmen/db";
import WebSocket from "ws";
import { refreshGammaEventIndex } from "./gamma_map.js";
import { buildPmSportSnapshot } from "./parse_sport.js";
import { resolveClientMatchIdFromSportMessage } from "./resolve_match.js";
import {
  getLastWrittenSportState,
  getPrevSportState,
  setLastWrittenSportState,
  setPrevSportState,
  shouldWritePmSport,
} from "./sport_state.js";

loadChangmenEnv();

const SPORTS_WS = "wss://sports-api.polymarket.com/ws";
const GAMMA_REFRESH_MS = 60_000;
const RECONNECT_MS = 5_000;

/** @type {{ byGameId: Map<number, object>, bySlug: Map<string, object> }} */
let gammaIndex = { byGameId: new Map(), bySlug: new Map() };
let ws = null;
let reconnectTimer = null;
let stopped = false;
/** @type {Map<number, number>} gameId -> last unresolved log ts */
const unresolvedLogAt = new Map();
const UNRESOLVED_LOG_MS = 60_000;

async function refreshGamma() {
  try {
    gammaIndex = await refreshGammaEventIndex();
    console.log(
      `[pm-sports] Gamma index: gameIds=${gammaIndex.byGameId.size} slugs=${gammaIndex.bySlug.size}`,
    );
  }
  catch (err) {
    console.warn("[pm-sports] Gamma refresh failed:", err.message);
  }
}

async function handleSportMessage(raw) {
  if (raw === "ping") {
    ws?.send("pong");
    return;
  }
  let msg;
  try {
    msg = JSON.parse(raw);
  }
  catch {
    return;
  }
  if (!msg || msg.gameId == null)
    return;

  const gameId = Number(msg.gameId);
  if (!Number.isFinite(gameId))
    return;

  const prev = getPrevSportState(gameId);
  const snapshot = buildPmSportSnapshot(msg, prev);
  setPrevSportState(gameId, snapshot);

  const lastWritten = getLastWrittenSportState(gameId);
  if (!shouldWritePmSport(snapshot, lastWritten))
    return;

  const clientMatchId = await resolveClientMatchIdFromSportMessage(msg, gammaIndex);
  if (!clientMatchId) {
    const now = Date.now();
    const last = unresolvedLogAt.get(gameId) || 0;
    if (now - last >= UNRESOLVED_LOG_MS) {
      unresolvedLogAt.set(gameId, now);
      console.warn(
        `[pm-sports] unresolved gameId=${gameId} slug=${msg.slug || ""} status=${msg.status || ""}`,
      );
    }
    return;
  }

  const ok = await updateClientMatchPmSport(clientMatchId, snapshot);
  if (ok) {
    setLastWrittenSportState(gameId, snapshot);
    console.log(
      `[pm-sports] cm=${clientMatchId} gameId=${gameId} ${snapshot.label || snapshot.status || ""}`,
    );
  }
}

function connectWs() {
  if (stopped || ws)
    return;

  ws = new WebSocket(SPORTS_WS);

  ws.on("open", () => {
    console.log("[pm-sports] Sports WS connected");
  });

  ws.on("message", (data) => {
    void handleSportMessage(String(data)).catch(err => {
      console.warn("[pm-sports] handle message:", err.message);
    });
  });

  ws.on("close", () => {
    ws = null;
    if (!stopped) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWs();
      }, RECONNECT_MS);
    }
  });

  ws.on("error", () => {
    ws?.close();
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[pm-sports] DATABASE_URL 未配置");
    process.exit(1);
  }

  await refreshGamma();
  setInterval(() => {
    void refreshGamma();
  }, GAMMA_REFRESH_MS);

  connectWs();

  const shutdown = () => {
    stopped = true;
    if (reconnectTimer)
      clearTimeout(reconnectTimer);
    ws?.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[pm-sports] fatal:", err);
  process.exit(1);
});
