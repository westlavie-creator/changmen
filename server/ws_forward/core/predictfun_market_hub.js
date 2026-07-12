/**
 * Predict.fun MARKET WebSocket Hub — 全站合并 predictOrderbook 订阅，单条上游连 PF。
 * 浏览器仍连 /esport/ws-forward/PREDICTFUN-MARKET；协议与 venue-adapter/ws.ts 一致。
 */
import { WebSocketServer, WebSocket } from "ws";
import {
  PREDICTFUN_MARKET_HUB_PATH,
  resolvePredictFunMarketUpstream,
} from "../platforms/predictfun.js";
import { recordConnect, recordDisconnect, recordError } from "./forward_stats.js";
import { createWsRelayGuard } from "./ws_backpressure.js";

const HUB_ID = "PREDICTFUN-MARKET";
const ORDERBOOK_TOPIC_PREFIX = "predictOrderbook/";
const HEARTBEAT_TOPIC = "heartbeat";
const UPSTREAM_IDLE_MS = 60_000;
const UPSTREAM_RECONNECT_MS = 5_000;

/** @typedef {{ marketIds: Set<string> }} HubClient */

/** @type {WebSocketServer | null} */
let wss = null;
/** @type {Map<WebSocket, HubClient>} */
const clients = new Map();
/** @type {WebSocket | null} */
let upstream = null;
let upstreamIdleTimer = null;
let upstreamConnecting = false;
let upstreamReconnectTimer = null;
/** @type {Set<string>} */
let upstreamSubscribed = new Set();
let upstreamRequestId = 1;

const toClientGuard = createWsRelayGuard(HUB_ID, "to-client");

/**
 * @param {string} topic
 * @returns {string | null}
 */
export function marketIdFromPredictOrderbookTopic(topic) {
  const raw = String(topic ?? "");
  if (!raw.startsWith(ORDERBOOK_TOPIC_PREFIX))
    return null;
  const id = raw.slice(ORDERBOOK_TOPIC_PREFIX.length).trim();
  return id || null;
}

/**
 * 从 PF 推送帧提取 marketId（用于 fan-out 过滤）。
 * @param {string} raw
 * @returns {Set<string>}
 */
export function extractMarketIdsFromPredictMessage(raw) {
  const out = new Set();
  const text = String(raw ?? "").trim();
  if (!text.startsWith("{"))
    return out;
  let parsed;
  try {
    parsed = JSON.parse(text);
  }
  catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object")
    return out;
  if (parsed.type === "M" && parsed.topic) {
    const marketId = marketIdFromPredictOrderbookTopic(parsed.topic);
    if (marketId)
      out.add(marketId);
  }
  return out;
}

/** @param {Map<WebSocket, HubClient>} clientMap */
export function mergeHubMarketIds(clientMap) {
  const merged = new Set();
  for (const row of clientMap.values()) {
    for (const id of row.marketIds)
      merged.add(id);
  }
  return merged;
}

/**
 * @param {string} raw
 * @returns {{ kind: "subscribe" | "unsubscribe", marketId: string } | null}
 */
export function parsePredictFunClientControl(raw) {
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
  if (method !== "subscribe" && method !== "unsubscribe")
    return null;
  const params = parsed.params;
  if (!Array.isArray(params) || !params[0])
    return null;
  const marketId = marketIdFromPredictOrderbookTopic(String(params[0]));
  if (!marketId)
    return null;
  return { kind: method, marketId };
}

function setsEqual(a, b) {
  if (a.size !== b.size)
    return false;
  for (const v of a) {
    if (!b.has(v))
      return false;
  }
  return true;
}

function buildUpstreamControl(method, marketId) {
  return JSON.stringify({
    method,
    requestId: upstreamRequestId++,
    params: [`${ORDERBOOK_TOPIC_PREFIX}${marketId}`],
  });
}

function buildHeartbeatReply(data) {
  return JSON.stringify({ method: "heartbeat", data });
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
  upstreamSubscribed = new Set();
  if (upstream) {
    try {
      upstream.close();
    }
    catch { /* ignore */ }
    upstream = null;
  }
  if (reason)
    console.warn(`[ws_forward/${HUB_ID}] upstream closed: ${reason}`);
}

function sendUpstreamSubscribe(marketId) {
  if (!upstream || upstream.readyState !== WebSocket.OPEN)
    return;
  upstream.send(buildUpstreamControl("subscribe", marketId));
}

function sendUpstreamUnsubscribe(marketId) {
  if (!upstream || upstream.readyState !== WebSocket.OPEN)
    return;
  upstream.send(buildUpstreamControl("unsubscribe", marketId));
}

function syncUpstreamSubscriptions() {
  const merged = mergeHubMarketIds(clients);
  if (!merged.size) {
    if (upstreamSubscribed.size && upstream?.readyState === WebSocket.OPEN) {
      for (const id of upstreamSubscribed)
        sendUpstreamUnsubscribe(id);
    }
    upstreamSubscribed = new Set();
    if (upstream?.readyState === WebSocket.OPEN)
      closeUpstream("no markets");
    return;
  }

  const toAdd = [...merged].filter(id => !upstreamSubscribed.has(id));
  const toRemove = [...upstreamSubscribed].filter(id => !merged.has(id));

  if (!toAdd.length && !toRemove.length)
    return;

  if (!upstream || upstream.readyState !== WebSocket.OPEN) {
    upstreamSubscribed = new Set(merged);
    return;
  }

  for (const id of toRemove)
    sendUpstreamUnsubscribe(id);
  for (const id of toAdd)
    sendUpstreamSubscribe(id);
  upstreamSubscribed = new Set(merged);
}

function scheduleUpstreamReconnect() {
  if (upstreamReconnectTimer || clients.size === 0)
    return;
  if (!mergeHubMarketIds(clients).size)
    return;
  upstreamReconnectTimer = setTimeout(() => {
    upstreamReconnectTimer = null;
    ensureUpstream();
  }, UPSTREAM_RECONNECT_MS);
}

function ensureUpstream() {
  if (upstream?.readyState === WebSocket.OPEN || upstreamConnecting)
    return;
  const merged = mergeHubMarketIds(clients);
  if (!merged.size)
    return;

  upstreamConnecting = true;
  const { url, headers } = resolvePredictFunMarketUpstream();
  let ws;
  try {
    ws = headers
      ? new WebSocket(url, { headers })
      : new WebSocket(url);
  }
  catch (err) {
    upstreamConnecting = false;
    recordError(HUB_ID, err.message);
    return;
  }

  ws.on("open", () => {
    upstreamConnecting = false;
    upstream = ws;
    upstreamSubscribed = new Set();
    const ids = mergeHubMarketIds(clients);
    for (const id of ids)
      sendUpstreamSubscribe(id);
    upstreamSubscribed = new Set(ids);
  });

  ws.on("message", (data, isBinary) => {
    const raw = isBinary ? data.toString() : String(data);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    }
    catch {
      parsed = null;
    }

    if (parsed?.type === "M" && parsed.topic === HEARTBEAT_TOPIC) {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(buildHeartbeatReply(parsed.data));
      return;
    }

    const marketIds = extractMarketIdsFromPredictMessage(raw);
    const broadcastAll = marketIds.size === 0;

    for (const [clientWs, row] of clients) {
      if (clientWs.readyState !== WebSocket.OPEN)
        continue;
      if (broadcastAll) {
        if (!row.marketIds.size)
          continue;
      }
      else {
        let hit = false;
        for (const id of marketIds) {
          if (row.marketIds.has(id)) {
            hit = true;
            break;
          }
        }
        if (!hit)
          continue;
      }
      if (toClientGuard.canSend(clientWs))
        clientWs.send(raw);
    }
  });

  ws.on("close", () => {
    if (upstream === ws)
      upstream = null;
    upstreamConnecting = false;
    upstreamSubscribed = new Set();
    scheduleUpstreamReconnect();
  });

  ws.on("error", (err) => {
    recordError(HUB_ID, err?.message || "upstream error");
  });
}

function onClientControl(clientWs, control) {
  const row = clients.get(clientWs);
  if (!row)
    return;
  if (control.kind === "subscribe")
    row.marketIds.add(control.marketId);
  else
    row.marketIds.delete(control.marketId);
  syncUpstreamSubscriptions();
  ensureUpstream();
}

function detachClient(clientWs) {
  if (!clients.has(clientWs))
    return;
  clients.delete(clientWs);
  recordDisconnect(HUB_ID);
  syncUpstreamSubscriptions();
  if (clients.size === 0)
    scheduleUpstreamIdleClose();
  else if (mergeHubMarketIds(clients).size > 0)
    ensureUpstream();
}

function attachClient(clientWs) {
  clients.set(clientWs, { marketIds: new Set() });
  recordConnect(HUB_ID);
  clearUpstreamIdleTimer();

  clientWs.on("message", (data, isBinary) => {
    const raw = isBinary ? data.toString() : String(data);
    const control = parsePredictFunClientControl(raw);
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
export function attachPredictFunMarketHub(httpServer) {
  if (wss)
    return;

  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname !== PREDICTFUN_MARKET_HUB_PATH && !pathname.startsWith(`${PREDICTFUN_MARKET_HUB_PATH}/`))
      return;

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      wss.emit("connection", clientWs, request);
    });
  });

  wss.on("connection", (clientWs) => {
    attachClient(clientWs);
  });
}

export function closePredictFunMarketHub() {
  clearUpstreamReconnectTimer();
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
export function resetPredictFunMarketHubForTests() {
  closePredictFunMarketHub();
}
