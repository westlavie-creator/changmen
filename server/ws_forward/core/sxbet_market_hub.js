/**
 * SX.bet MARKET WebSocket Hub — VPS 持有一把 API key，单条 Centrifugo 订 best_odds:global，扇出给浏览器。
 * 浏览器连 /esport/ws-forward/SXBET-MARKET（勿挂在 changmen-esport）。
 */
import { Centrifuge } from "centrifuge";
import { WebSocketServer, WebSocket } from "ws";
import {
  SXBET_BEST_ODDS_CHANNEL,
  SXBET_MARKET_HUB_PATH,
  SXBET_WS,
  fetchSxBetRealtimeToken,
  resolveSxBetWsApiKey,
} from "../platforms/sxbet.js";
import { recordConnect, recordDisconnect, recordError } from "./forward_stats.js";
import { attachHubUpstreamBackpressure, createWsRelayGuard } from "./ws_backpressure.js";

const HUB_ID = "SXBET-MARKET";
const UPSTREAM_IDLE_MS = 60_000;
const UPSTREAM_RECONNECT_MS = 5_000;

/** @typedef {{ marketHashes: Set<string> }} HubClient */

/** @type {WebSocketServer | null} */
let wss = null;
/** @type {Map<WebSocket, HubClient>} */
const clients = new Map();
/** @type {import("centrifuge").Centrifuge | null} */
let upstream = null;
/** @type {import("centrifuge").Subscription | null} */
let upstreamSub = null;
let hubAttached = false;
let upstreamIdleTimer = null;
let upstreamConnecting = false;
let upstreamReconnectTimer = null;
let upstreamState = "idle";

const toClientGuard = createWsRelayGuard(HUB_ID, "to-client");
/** @type {(() => void) | null} */
let stopHubBackpressure = null;

/**
 * @param {string} raw
 * @returns {{ kind: "subscribe" | "unsubscribe" | "ping", marketHashes?: string[] } | null}
 */
export function parseSxBetClientControl(raw) {
  const text = String(raw ?? "").trim();
  if (!text.startsWith("{"))
    return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  }
  catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object")
    return null;
  const method = String(parsed.method ?? "").toLowerCase();
  if (method === "ping")
    return { kind: "ping" };
  if (method !== "subscribe" && method !== "unsubscribe")
    return null;
  const params = parsed.params;
  const hashes = [];
  if (Array.isArray(params?.marketHashes)) {
    for (const h of params.marketHashes) {
      const id = String(h || "").trim();
      if (id)
        hashes.push(id);
    }
  }
  else if (Array.isArray(params)) {
    for (const h of params) {
      const id = String(h || "").trim();
      if (id)
        hashes.push(id);
    }
  }
  return { kind: method, marketHashes: hashes };
}

function buildReadyFrame() {
  return JSON.stringify({ type: "ready", channel: SXBET_BEST_ODDS_CHANNEL });
}

function buildBestOddsFrame(data) {
  return JSON.stringify({ type: "best_odds", data });
}

function buildErrorFrame(message) {
  return JSON.stringify({ type: "error", message: String(message || "error") });
}

function clearUpstreamIdleTimer() {
  if (upstreamIdleTimer) {
    clearTimeout(upstreamIdleTimer);
    upstreamIdleTimer = null;
  }
}

function scheduleUpstreamIdleClose() {
  clearUpstreamIdleTimer();
  if (clients.size > 0)
    return;
  upstreamIdleTimer = setTimeout(() => {
    upstreamIdleTimer = null;
    if (clients.size === 0)
      closeUpstream("idle");
  }, UPSTREAM_IDLE_MS);
}

function clearUpstreamReconnectTimer() {
  if (upstreamReconnectTimer) {
    clearTimeout(upstreamReconnectTimer);
    upstreamReconnectTimer = null;
  }
}

function closeUpstream(reason) {
  clearUpstreamReconnectTimer();
  upstreamConnecting = false;
  upstreamState = "idle";
  try {
    upstreamSub?.unsubscribe();
  }
  catch { /* ignore */ }
  upstreamSub = null;
  if (upstream) {
    try {
      upstream.disconnect();
    }
    catch { /* ignore */ }
    upstream = null;
  }
  if (reason)
    console.warn(`[ws_forward/${HUB_ID}] upstream closed: ${reason}`);
}

function fanOutBestOdds(data) {
  const rows = Array.isArray(data) ? data : [data];
  const hashesInFrame = new Set();
  for (const row of rows) {
    if (row && typeof row === "object") {
      const hash = String(row.marketHash ?? "").trim();
      if (hash)
        hashesInFrame.add(hash);
    }
  }
  const payload = buildBestOddsFrame(Array.isArray(data) ? data : data);
  for (const [clientWs, row] of clients) {
    if (clientWs.readyState !== WebSocket.OPEN)
      continue;
    // 空 interest = 收全量；有 interest 则按 marketHash 过滤
    if (row.marketHashes.size > 0 && hashesInFrame.size > 0) {
      let hit = false;
      for (const h of hashesInFrame) {
        if (row.marketHashes.has(h)) {
          hit = true;
          break;
        }
      }
      if (!hit)
        continue;
    }
    if (toClientGuard.canSend(clientWs))
      clientWs.send(payload);
  }
}

function scheduleUpstreamReconnect() {
  if (upstreamReconnectTimer || clients.size === 0)
    return;
  upstreamReconnectTimer = setTimeout(() => {
    upstreamReconnectTimer = null;
    ensureUpstream();
  }, UPSTREAM_RECONNECT_MS);
}

function ensureUpstream() {
  if (upstreamState === "open" || upstreamConnecting)
    return;
  if (clients.size === 0)
    return;

  const apiKey = resolveSxBetWsApiKey();
  if (!apiKey) {
    recordError(HUB_ID, "SXBET_API_KEY missing");
    for (const clientWs of clients.keys()) {
      if (clientWs.readyState === WebSocket.OPEN)
        clientWs.send(buildErrorFrame("SXBET_API_KEY 未配置"));
    }
    return;
  }

  upstreamConnecting = true;
  upstreamState = "connecting";

  const client = new Centrifuge(SXBET_WS, {
    websocket: WebSocket,
    getToken: () => fetchSxBetRealtimeToken(apiKey),
  });

  client.on("connected", () => {
    upstreamConnecting = false;
    upstream = client;
    upstreamState = "open";
    console.log(`[ws_forward/${HUB_ID}] upstream connected channel=${SXBET_BEST_ODDS_CHANNEL}`);
  });

  client.on("disconnected", () => {
    if (upstream === client)
      upstream = null;
    upstreamConnecting = false;
    upstreamState = "idle";
    upstreamSub = null;
    scheduleUpstreamReconnect();
  });

  client.on("error", (ctx) => {
    const msg = ctx?.error?.message || ctx?.message || "upstream error";
    recordError(HUB_ID, String(msg));
  });

  const sub = client.newSubscription(SXBET_BEST_ODDS_CHANNEL);
  sub.on("publication", (ctx) => {
    try {
      fanOutBestOdds(ctx?.data);
    }
    catch (err) {
      recordError(HUB_ID, err?.message || "fan-out error");
    }
  });
  sub.subscribe();
  upstreamSub = sub;
  client.connect();
}

function onClientControl(clientWs, control) {
  const row = clients.get(clientWs);
  if (!row)
    return;
  if (control.kind === "ping") {
    if (clientWs.readyState === WebSocket.OPEN)
      clientWs.send(JSON.stringify({ type: "pong" }));
    return;
  }
  if (control.kind === "subscribe") {
    for (const h of control.marketHashes || [])
      row.marketHashes.add(h);
  }
  else if (control.kind === "unsubscribe") {
    for (const h of control.marketHashes || [])
      row.marketHashes.delete(h);
  }
}

function detachClient(clientWs) {
  if (!clients.has(clientWs))
    return;
  clients.delete(clientWs);
  recordDisconnect(HUB_ID);
  if (clients.size === 0)
    scheduleUpstreamIdleClose();
  else
    ensureUpstream();
}

function attachClient(clientWs) {
  clients.set(clientWs, { marketHashes: new Set() });
  recordConnect(HUB_ID);
  clearUpstreamIdleTimer();
  ensureUpstream();

  if (clientWs.readyState === WebSocket.OPEN)
    clientWs.send(buildReadyFrame());

  clientWs.on("message", (data, isBinary) => {
    const raw = isBinary ? data.toString() : String(data);
    const control = parseSxBetClientControl(raw);
    if (!control)
      return;
    onClientControl(clientWs, control);
  });

  clientWs.on("close", () => {
    detachClient(clientWs);
  });

  clientWs.on("error", () => {
    detachClient(clientWs);
    try {
      clientWs.close();
    }
    catch { /* ignore */ }
  });
}

/**
 * @param {import("node:http").Server} httpServer
 */
export function attachSxBetMarketHub(httpServer) {
  if (wss)
    return;

  hubAttached = true;
  wss = new WebSocketServer({ noServer: true });
  stopHubBackpressure?.();
  stopHubBackpressure = attachHubUpstreamBackpressure(
    () => clients.keys(),
    () => null,
    toClientGuard,
    HUB_ID,
  );

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname !== SXBET_MARKET_HUB_PATH && !pathname.startsWith(`${SXBET_MARKET_HUB_PATH}/`))
      return;

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      wss.emit("connection", clientWs, request);
    });
  });

  wss.on("connection", (clientWs) => {
    attachClient(clientWs);
  });
}

export function isSxBetMarketHubAttached() {
  return hubAttached && Boolean(wss);
}

export function getSxBetMarketHubStatus() {
  return {
    attached: isSxBetMarketHubAttached(),
    clients: clients.size,
    upstream: upstreamState,
    channel: SXBET_BEST_ODDS_CHANNEL,
    hasApiKey: Boolean(resolveSxBetWsApiKey()),
  };
}

export function closeSxBetMarketHub() {
  clearUpstreamReconnectTimer();
  stopHubBackpressure?.();
  stopHubBackpressure = null;
  hubAttached = false;
  for (const clientWs of [...clients.keys()]) {
    try {
      clientWs.close();
    }
    catch { /* ignore */ }
  }
  clients.clear();
  closeUpstream("shutdown");
  clearUpstreamIdleTimer();
  if (wss) {
    wss.close();
    wss = null;
  }
}

/** @internal 测试重置 */
export function resetSxBetMarketHubForTests() {
  closeSxBetMarketHub();
}
