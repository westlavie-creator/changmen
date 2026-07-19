/**
 * House 主号 predictWalletEvents（VPS 持 JWT，浏览器不接）
 * @see https://dev.predict.fun/subscription-topics-1915507m0
 * @see https://dev.predict.fun/general-information-1915499m0
 */

import WebSocket from "ws";
import {
  resolvePredictFunApiBase,
  resolvePredictFunApiKey,
} from "./house_credentials.js";
import { fetchPredictFunHouseOrderJwt } from "./pf_house_session.js";
import {
  officialStubFromWalletHint,
  parsePredictWalletEvent,
} from "./pf_wallet_events_parse.js";

const HEARTBEAT_TOPIC = "heartbeat";
const EVENT_TTL_MS = 10 * 60_000;
const RECONNECT_MS = 5_000;

/** @type {Map<string, { hint: object, at: number }>} */
const hintsByKey = new Map();
/** @type {Map<string, Set<(hint: object) => void>>} */
const waitersByKey = new Map();

/** @type {WebSocket|null} */
let socket = null;
let started = false;
let stopped = false;
let reconnectTimer = null;
let requestId = 1;
/** @type {string} */
let subscribedJwt = "";

function resolvePredictFunWsUrl() {
  const fromEnv = String(process.env.PREDICT_FUN_WS_URL ?? "").trim();
  if (fromEnv)
    return fromEnv;
  const apiBase = resolvePredictFunApiBase();
  if (String(apiBase).includes("testnet"))
    return "wss://ws-testnet.predict.fun/ws";
  return "wss://ws.predict.fun/ws";
}

function hintKeys(hint) {
  const keys = [];
  if (hint?.orderHash)
    keys.push(String(hint.orderHash).toLowerCase());
  if (hint?.orderId)
    keys.push(`id:${String(hint.orderId)}`);
  return keys;
}

function pruneHints() {
  const now = Date.now();
  for (const [k, row] of hintsByKey) {
    if (now - row.at > EVENT_TTL_MS)
      hintsByKey.delete(k);
  }
}

function storeHint(hint) {
  if (!hint)
    return;
  pruneHints();
  const at = Date.now();
  for (const key of hintKeys(hint)) {
    hintsByKey.set(key, { hint, at });
    const waiters = waitersByKey.get(key);
    if (waiters) {
      for (const fn of waiters)
        fn(hint);
      waitersByKey.delete(key);
    }
  }
}

/**
 * @param {string} orderHashOrId
 * @returns {object|null}
 */
export function getHouseWalletSettlementHint(orderHashOrId) {
  const raw = String(orderHashOrId ?? "").trim();
  if (!raw)
    return null;
  pruneHints();
  const row = hintsByKey.get(raw.toLowerCase())
    || hintsByKey.get(`id:${raw}`);
  return row?.hint ?? null;
}

/**
 * 等待 wallet 终态提示（filled/unfilled）；超时返回 null
 * @param {string} orderHashOrId
 * @param {number} timeoutMs
 */
export function waitForHouseWalletSettlementHint(orderHashOrId, timeoutMs = 8_000) {
  const raw = String(orderHashOrId ?? "").trim();
  if (!raw)
    return Promise.resolve(null);

  const existing = getHouseWalletSettlementHint(raw);
  if (existing && existing.settlement !== "pending")
    return Promise.resolve(existing);

  return new Promise((resolve) => {
    const keys = [raw.toLowerCase(), `id:${raw}`];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled)
        return;
      settled = true;
      for (const k of keys) {
        const set = waitersByKey.get(k);
        if (set) {
          set.delete(onHint);
          if (!set.size)
            waitersByKey.delete(k);
        }
      }
      resolve(null);
    }, Math.max(50, timeoutMs));

    function onHint(hint) {
      if (settled)
        return;
      if (!hint || hint.settlement === "pending")
        return;
      settled = true;
      clearTimeout(timer);
      for (const k of keys) {
        const set = waitersByKey.get(k);
        if (set) {
          set.delete(onHint);
          if (!set.size)
            waitersByKey.delete(k);
        }
      }
      resolve(hint);
    }

    for (const k of keys) {
      let set = waitersByKey.get(k);
      if (!set) {
        set = new Set();
        waitersByKey.set(k, set);
      }
      set.add(onHint);
    }
  });
}

function formatHeartbeatReply(data) {
  return JSON.stringify({ method: "heartbeat", data });
}

function handleRawMessage(raw) {
  const text = String(raw ?? "");
  let payload;
  try {
    payload = JSON.parse(text);
  }
  catch {
    return;
  }
  if (payload?.type === "M" && payload?.topic === HEARTBEAT_TOPIC) {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(formatHeartbeatReply(payload.data));
    return;
  }
  const hint = parsePredictWalletEvent(payload);
  if (hint)
    storeHint(hint);
}

async function subscribeWalletEvents(jwt) {
  if (!socket || socket.readyState !== WebSocket.OPEN)
    return;
  const token = String(jwt ?? "").trim();
  if (!token)
    return;
  if (subscribedJwt && subscribedJwt !== token) {
    // JWT 轮换：重新 subscribe（旧 topic 会 invalid_credentials）
  }
  subscribedJwt = token;
  socket.send(JSON.stringify({
    method: "subscribe",
    requestId: requestId++,
    params: [`predictWalletEvents/${token}`],
  }));
}

function scheduleReconnect() {
  if (stopped || reconnectTimer)
    return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectUpstream();
  }, RECONNECT_MS);
}

async function connectUpstream() {
  if (stopped)
    return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))
    return;

  const apiKey = resolvePredictFunApiKey();
  if (!apiKey) {
    console.warn("[Pf_WalletEvents] 无 API Key，跳过");
    return;
  }

  let jwt;
  try {
    ({ jwt } = await fetchPredictFunHouseOrderJwt());
  }
  catch (err) {
    console.warn("[Pf_WalletEvents] JWT 失败", err);
    scheduleReconnect();
    return;
  }

  const baseUrl = resolvePredictFunWsUrl();
  const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(apiKey)}`;

  try {
    socket = new WebSocket(url, {
      headers: { "x-api-key": apiKey },
    });
  }
  catch (err) {
    console.warn("[Pf_WalletEvents] connect failed", err);
    scheduleReconnect();
    return;
  }

  socket.on("open", () => {
    console.info("[Pf_WalletEvents] connected");
    void subscribeWalletEvents(jwt);
  });
  socket.on("message", (data) => {
    handleRawMessage(typeof data === "string" ? data : data.toString());
  });
  socket.on("close", () => {
    socket = null;
    subscribedJwt = "";
    if (!stopped)
      scheduleReconnect();
  });
  socket.on("error", (err) => {
    console.warn("[Pf_WalletEvents] error", err?.message || err);
  });
}

/** 懒启动：首次等单时调用 */
export function ensureHouseWalletEventsStarted() {
  if (String(process.env.PF_HOUSE_SKIP_WALLET_EVENTS ?? "").trim() === "1")
    return;
  if (started)
    return;
  started = true;
  stopped = false;
  void connectUpstream();
}

/** 将 wallet 提示转为 REST OrderData stub（供 wait 使用） */
export { officialStubFromWalletHint };

/** @internal */
export function _ingestWalletEventForTests(raw) {
  const hint = parsePredictWalletEvent(raw);
  if (hint)
    storeHint(hint);
  return hint;
}

/** @internal */
export function _resetHouseWalletEventsForTests() {
  hintsByKey.clear();
  waitersByKey.clear();
  stopped = true;
  started = false;
  subscribedJwt = "";
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.close();
    }
    catch {
      /* ignore */
    }
    socket = null;
  }
  stopped = false;
}
