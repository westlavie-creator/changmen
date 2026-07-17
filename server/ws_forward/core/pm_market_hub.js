/**
 * Polymarket MARKET WebSocket Hub — 全站合并 asset 订阅，单条上游连 PM。
 * 浏览器仍连 /esport/ws-forward/PM-MARKET；PM-USER 保持 1:1 raw 转发。
 * 升级可带 JWT（?token= / Bearer）写入健康页归属；无 token / 校验失败仍放行（避免断采）。
 */
import { WebSocketServer, WebSocket } from "ws";
import store from "../../backend/core/esport-api/store.js";
import { PM_MARKET_WS_URL } from "../platforms/pm.js";
import { recordConnect, recordDisconnect, recordError } from "./forward_stats.js";
import { createWsRelayGuard } from "./ws_backpressure.js";

export const PM_MARKET_HUB_PATH = "/esport/ws-forward/PM-MARKET";
const HUB_ID = "PM-MARKET";
const UPSTREAM_PING_MS = 10_000;
const UPSTREAM_IDLE_MS = 60_000;

/** @typedef {{
 *   id: number,
 *   userId: string,
 *   userName: string,
 *   assetIds: Set<string>,
 *   connectedAt: number,
 *   lastSubscribeAt: number,
 *   lastBufferedAmount: number,
 *   droppedToClient: number,
 *   sentToClient: number,
 *   remoteAddress: string,
 *   xForwardedFor: string,
 *   userAgent: string,
 * }} HubClient */

/**
 * 从 upgrade 请求提取 JWT（query token 优先，其次 Authorization Bearer / token 头）。
 * @param {{ url?: string, headers?: Record<string, string|string[]|undefined> }} request
 * @returns {string}
 */
export function extractPmMarketUpgradeToken(request) {
  try {
    const u = new URL(request?.url || "/", "http://localhost");
    const q = String(u.searchParams.get("token") || "").trim();
    if (q)
      return q;
  }
  catch { /* ignore */ }
  const headers = request?.headers || {};
  const rawAuth = headers.authorization ?? headers.Authorization;
  const auth = Array.isArray(rawAuth) ? String(rawAuth[0] || "") : String(rawAuth || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer?.[1])
    return bearer[1].trim();
  const rawTok = headers.token ?? headers.Token;
  const tok = Array.isArray(rawTok) ? String(rawTok[0] || "") : String(rawTok || "");
  return tok.trim();
}

function rejectUpgrade(socket, status = 401, reason = "Unauthorized") {
  try {
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }
  catch { /* ignore */ }
  try {
    socket.destroy();
  }
  catch { /* ignore */ }
}

/** @type {WebSocketServer | null} */
let wss = null;
/** @type {Map<WebSocket, HubClient>} */
const clients = new Map();
/** @type {WebSocket | null} */
let upstream = null;
let upstreamPingTimer = null;
let upstreamIdleTimer = null;
let upstreamConnecting = false;
/** @type {Set<string>} */
let upstreamSubscribed = new Set();
let upstreamInitialPending = false;
let nextClientId = 1;

const toClientGuard = createWsRelayGuard(HUB_ID, "to-client");

function summarizeText(value, max = 120) {
  const s = String(value || "").trim();
  if (!s)
    return "";
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function detectRemoteAddress(request) {
  const forwarded = String(request?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)[0];
  return forwarded
    || String(request?.headers?.["x-real-ip"] || "").trim()
    || String(request?.socket?.remoteAddress || "").trim()
    || "";
}

/**
 * 从 PM market 推送帧提取 asset_id（用于 fan-out 过滤）。
 * @param {string} raw
 * @returns {Set<string>}
 */
export function extractAssetIdsFromPmMarketMessage(raw) {
  const out = new Set();
  const text = String(raw ?? "").trim();
  if (!text || text === "PONG" || (!text.startsWith("{") && !text.startsWith("[")))
    return out;
  let parsed;
  try {
    parsed = JSON.parse(text);
  }
  catch {
    return out;
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object")
      continue;
    if (msg.asset_id)
      out.add(String(msg.asset_id));
    if (Array.isArray(msg.price_changes)) {
      for (const change of msg.price_changes) {
        if (change?.asset_id)
          out.add(String(change.asset_id));
      }
    }
  }
  return out;
}

/** @param {Map<WebSocket, HubClient>} clientMap */
export function mergeHubAssetIds(clientMap) {
  const merged = new Set();
  for (const row of clientMap.values()) {
    for (const id of row.assetIds)
      merged.add(id);
  }
  return merged;
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

function parseClientSubscribe(raw) {
  const text = String(raw ?? "").trim();
  if (!text)
    return null;
  if (text === "PING")
    return { kind: "ping" };
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
  const ids = parsed.assets_ids ?? parsed.asset_ids;
  if (!Array.isArray(ids))
    return null;
  const assetIds = ids.map(id => String(id).trim()).filter(Boolean);
  return {
    kind: "subscribe",
    assetIds,
    initialDump: Boolean(parsed.initial_dump),
  };
}

function buildUpstreamSubscribe(assetIds, initialDump) {
  return JSON.stringify({
    assets_ids: [...assetIds],
    type: "market",
    custom_feature_enabled: true,
    initial_dump: initialDump,
  });
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

function stopUpstreamPing() {
  if (upstreamPingTimer) {
    clearInterval(upstreamPingTimer);
    upstreamPingTimer = null;
  }
}

function startUpstreamPing() {
  stopUpstreamPing();
  upstreamPingTimer = setInterval(() => {
    if (upstream?.readyState === WebSocket.OPEN)
      upstream.send("PING");
  }, UPSTREAM_PING_MS);
}

function closeUpstream(reason) {
  stopUpstreamPing();
  clearUpstreamReconnectTimer();
  upstreamConnecting = false;
  upstreamSubscribed = new Set();
  upstreamInitialPending = false;
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

function syncUpstreamSubscription(initialDump) {
  const merged = mergeHubAssetIds(clients);
  if (!merged.size) {
    upstreamSubscribed = new Set();
    if (upstream?.readyState === WebSocket.OPEN)
      closeUpstream("no assets");
    return;
  }
  const changed = !setsEqual(merged, upstreamSubscribed);
  if (!changed && !initialDump)
    return;
  if (!upstream || upstream.readyState !== WebSocket.OPEN) {
    upstreamInitialPending = initialDump || upstreamInitialPending;
    return;
  }
  upstream.send(buildUpstreamSubscribe(merged, initialDump || upstreamInitialPending));
  upstreamSubscribed = new Set(merged);
  upstreamInitialPending = false;
}

let upstreamReconnectTimer = null;
const UPSTREAM_RECONNECT_MS = 5_000;

function clearUpstreamReconnectTimer() {
  if (upstreamReconnectTimer) {
    clearTimeout(upstreamReconnectTimer);
    upstreamReconnectTimer = null;
  }
}

function scheduleUpstreamReconnect() {
  if (upstreamReconnectTimer || clients.size === 0)
    return;
  if (!mergeHubAssetIds(clients).size)
    return;
  upstreamReconnectTimer = setTimeout(() => {
    upstreamReconnectTimer = null;
    ensureUpstream();
  }, UPSTREAM_RECONNECT_MS);
}

function ensureUpstream() {
  if (upstream?.readyState === WebSocket.OPEN || upstreamConnecting)
    return;
  if (!mergeHubAssetIds(clients).size)
    return;

  upstreamConnecting = true;
  let ws;
  try {
    ws = new WebSocket(PM_MARKET_WS_URL);
  }
  catch (err) {
    upstreamConnecting = false;
    recordError(HUB_ID, err.message);
    return;
  }

  ws.on("open", () => {
    upstreamConnecting = false;
    upstream = ws;
    startUpstreamPing();
    const merged = mergeHubAssetIds(clients);
    const initial = upstreamInitialPending || merged.size > 0;
    if (merged.size) {
      ws.send(buildUpstreamSubscribe(merged, initial));
      upstreamSubscribed = new Set(merged);
    }
    upstreamInitialPending = false;
  });

  ws.on("message", (data, isBinary) => {
    const raw = isBinary ? data.toString() : String(data);
    if (raw === "PONG")
      return;
    const assetIds = extractAssetIdsFromPmMarketMessage(raw);
    const broadcastAll = assetIds.size === 0;
    for (const [clientWs, row] of clients) {
      if (clientWs.readyState !== WebSocket.OPEN)
        continue;
      if (broadcastAll) {
        if (!row.assetIds.size)
          continue;
      }
      else {
        let hit = false;
        for (const id of assetIds) {
          if (row.assetIds.has(id)) {
            hit = true;
            break;
          }
        }
        if (!hit)
          continue;
      }
      row.lastBufferedAmount = Number(clientWs.bufferedAmount) || 0;
      if (toClientGuard.canSend(clientWs)) {
        row.sentToClient += 1;
        clientWs.send(raw);
      }
      else {
        row.droppedToClient += 1;
      }
    }
  });

  ws.on("close", () => {
    if (upstream === ws)
      upstream = null;
    upstreamConnecting = false;
    upstreamSubscribed = new Set();
    stopUpstreamPing();
    scheduleUpstreamReconnect();
  });

  ws.on("error", (err) => {
    recordError(HUB_ID, err?.message || "upstream error");
  });
}

function onClientSubscribe(clientWs, assetIds, initialDump) {
  const row = clients.get(clientWs);
  if (!row)
    return;
  row.assetIds = new Set(assetIds);
  row.lastSubscribeAt = Date.now();
  syncUpstreamSubscription(initialDump);
  ensureUpstream();
}

function detachClient(clientWs) {
  if (!clients.has(clientWs))
    return;
  clients.delete(clientWs);
  recordDisconnect(HUB_ID);
  syncUpstreamSubscription(false);
  if (clients.size === 0)
    scheduleUpstreamIdleClose();
  else if (mergeHubAssetIds(clients).size > 0)
    ensureUpstream();
}

/**
 * @param {import("ws").WebSocket} clientWs
 * @param {import("node:http").IncomingMessage} request
 * @param {{ userId?: string, userName?: string }} [meta]
 */
function attachClient(clientWs, request, meta = {}) {
  clients.set(clientWs, {
    id: nextClientId++,
    userId: String(meta.userId || "").trim(),
    userName: String(meta.userName || "").trim(),
    assetIds: new Set(),
    connectedAt: Date.now(),
    lastSubscribeAt: 0,
    lastBufferedAmount: 0,
    droppedToClient: 0,
    sentToClient: 0,
    remoteAddress: detectRemoteAddress(request),
    xForwardedFor: summarizeText(request?.headers?.["x-forwarded-for"] || "", 80),
    userAgent: summarizeText(request?.headers?.["user-agent"] || "", 120),
  });
  recordConnect(HUB_ID);
  clearUpstreamIdleTimer();

  clientWs.on("message", (data, isBinary) => {
    const raw = isBinary ? data.toString() : String(data);
    const parsed = parseClientSubscribe(raw);
    if (!parsed)
      return;
    if (parsed.kind === "ping") {
      if (clientWs.readyState === WebSocket.OPEN)
        clientWs.send("PONG");
      return;
    }
    onClientSubscribe(clientWs, parsed.assetIds, parsed.initialDump);
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
export function attachPmMarketHub(httpServer) {
  if (wss)
    return;

  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname !== PM_MARKET_HUB_PATH && !pathname.startsWith(`${PM_MARKET_HUB_PATH}/`))
      return;

    void (async () => {
      try {
        const token = extractPmMarketUpgradeToken(request);
        let userId = "";
        let userName = "";
        if (token) {
          try {
            const identity = await store.resolveUserIdentityByToken(token);
            userId = String(identity?.userId || "").trim();
            userName = String(identity?.userName || "").trim();
            if (!userId) {
              recordError(HUB_ID, "upgrade identity: token present but invalid/expired");
            }
          }
          catch (err) {
            recordError(HUB_ID, err?.message || "upgrade identity error");
          }
        }
        if (!wss || socket.destroyed) {
          if (!socket.destroyed)
            rejectUpgrade(socket, 503, "Service Unavailable");
          return;
        }
        wss.handleUpgrade(request, socket, head, (clientWs) => {
          wss.emit("connection", clientWs, request, { userId, userName });
        });
      }
      catch (err) {
        recordError(HUB_ID, err?.message || "upgrade error");
        rejectUpgrade(socket, 500, "Internal Server Error");
      }
    })();
  });

  wss.on("connection", (clientWs, request, meta) => {
    attachClient(clientWs, request, meta || {});
  });
}

export function getPmMarketHubStatus() {
  const rows = [...clients.values()].map(row => ({
    id: row.id,
    userId: row.userId || "",
    userName: row.userName || "",
    assetCount: row.assetIds.size,
    connectedForSec: Math.max(0, Math.round((Date.now() - row.connectedAt) / 1000)),
    idleSubscribeSec: row.lastSubscribeAt
      ? Math.max(0, Math.round((Date.now() - row.lastSubscribeAt) / 1000))
      : null,
    lastBufferedAmount: row.lastBufferedAmount,
    droppedToClient: row.droppedToClient,
    sentToClient: row.sentToClient,
    remoteAddress: row.remoteAddress,
    xForwardedFor: row.xForwardedFor,
    userAgent: row.userAgent,
  }));
  rows.sort((a, b) =>
    (b.droppedToClient - a.droppedToClient)
    || (b.lastBufferedAmount - a.lastBufferedAmount)
    || (b.assetCount - a.assetCount),
  );
  return {
    activeClients: rows.length,
    subscribedAssets: upstreamSubscribed.size,
    upstreamConnected: upstream?.readyState === WebSocket.OPEN,
    slowClients: rows.slice(0, 10),
  };
}

export function closePmMarketHub() {
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
export function resetPmMarketHubForTests() {
  closePmMarketHub();
}
