import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { reportVenueWsStatus } from "../shared/venueWsStatus";
import type { PolymarketOrderRow } from "./orderTypes";
import { polymarketUserSubscribeMessage, polymarketUserSubscribeMoreMessage } from "./api";
import { resolvePolymarketUserWsUrl } from "./wsConfig";
import {
  cyclePmUserWsSourceMode,
  getPmUserWsSourceMode,
  pmUserWsSourceModeLabel,
  type PmUserWsSourceMode,
} from "./pmUserWsMode";
import { parseTokenConfig, resolveApiCreds } from "./l2Auth";
import {
  interpretPolymarketUserWsMessage,
  polymarketOrderRowFromUserWsMessage,
} from "./userWsMessages";

const WS_RECONNECT_MS = 5_000;
const WS_PING_MS = 10_000;
const DEFAULT_WATCH_TIMEOUT_MS = 45_000;

export interface PolymarketWsSettleResult {
  source: "ws";
  outcome: "matched" | "unfilled";
  row: PolymarketOrderRow | null;
}

interface WatchEntry {
  promise: Promise<PolymarketWsSettleResult | null>;
  settled: boolean;
  result: PolymarketWsSettleResult | null;
  resolve: (value: PolymarketWsSettleResult | null) => void;
}

interface UserWsSession {
  accountKey: string;
  auth: { apiKey: string; secret: string; passphrase: string };
  markets: Set<string>;
  ws: WebSocket | null;
  stopped: boolean;
  skipNextReconnect: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  connected: boolean;
}

const sessions = new Map<string, UserWsSession>();
const orderWatches = new Map<string, WatchEntry>();

function refreshPolymarketUserWsStatus(): void {
  if (!sessions.size) {
    reportVenueWsStatus("pm-user", "disconnected");
    return;
  }
  let status: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  for (const session of sessions.values()) {
    if (session.stopped)
      continue;
    if (session.connected) {
      status = "connected";
      break;
    }
    if (session.reconnectTimer)
      status = "error";
    else if (session.ws)
      status = "connecting";
  }
  reportVenueWsStatus("pm-user", status);
}

function sessionKeyFromAccount(account: PlatformAccount): string | null {
  const creds = resolveApiCreds(parseTokenConfig(account.token));
  const apiKey = String(creds.apiKey ?? "").trim();
  return apiKey || null;
}

function resolveSessionAuth(account: PlatformAccount) {
  const creds = resolveApiCreds(parseTokenConfig(account.token));
  const apiKey = String(creds.apiKey ?? "").trim();
  const secret = String(creds.secret ?? "").trim();
  const passphrase = String(creds.passphrase ?? "").trim();
  if (!apiKey || !secret || !passphrase)
    return null;
  return { apiKey, secret, passphrase };
}

function getOrCreateSession(account: PlatformAccount): UserWsSession | null {
  const accountKey = sessionKeyFromAccount(account);
  const auth = resolveSessionAuth(account);
  if (!accountKey || !auth)
    return null;

  let session = sessions.get(accountKey);
  if (!session) {
    session = {
      accountKey,
      auth,
      markets: new Set(),
      ws: null,
      stopped: false,
      skipNextReconnect: false,
      reconnectTimer: null,
      pingTimer: null,
      connected: false,
    };
    sessions.set(accountKey, session);
  }
  return session;
}

function cleanupSessionTimers(session: UserWsSession) {
  if (session.pingTimer) {
    clearInterval(session.pingTimer);
    session.pingTimer = null;
  }
  session.ws = null;
  session.connected = false;
}

function sendJson(session: UserWsSession, payload: unknown) {
  if (session.ws?.readyState === WebSocket.OPEN)
    session.ws.send(JSON.stringify(payload));
}

function subscribeMarketOnSession(session: UserWsSession, conditionId: string) {
  const id = String(conditionId ?? "").trim();
  if (!id || session.markets.has(id))
    return;
  session.markets.add(id);
  if (session.connected) {
    sendJson(session, polymarketUserSubscribeMoreMessage([id]));
    return;
  }
  ensureUserWsConnected(session);
}

function settleWatch(orderId: string, result: PolymarketWsSettleResult) {
  const entry = orderWatches.get(orderId);
  if (!entry || entry.settled)
    return;
  entry.settled = true;
  entry.result = result;
  entry.resolve(result);
}

function dispatchUserWsMessage(_session: UserWsSession, raw: string) {
  if (raw === "PONG" || !raw.trim().startsWith("{"))
    return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  }
  catch {
    return;
  }

  for (const [orderId, entry] of orderWatches) {
    if (entry.settled)
      continue;
    const outcome = interpretPolymarketUserWsMessage(parsed, orderId);
    if (!outcome)
      continue;
    const msg = parsed as Record<string, unknown>;
    settleWatch(orderId, {
      source: "ws",
      outcome,
      row: polymarketOrderRowFromUserWsMessage(msg, outcome),
    });
  }
}

function forceReconnectSession(session: UserWsSession) {
  if (session.stopped)
    return;
  session.skipNextReconnect = true;
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  const oldWs = session.ws;
  cleanupSessionTimers(session);
  oldWs?.close();
  ensureUserWsConnected(session);
}

function scheduleReconnect(session: UserWsSession) {
  if (session.stopped || session.reconnectTimer)
    return;
  refreshPolymarketUserWsStatus();
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    ensureUserWsConnected(session);
  }, WS_RECONNECT_MS);
}

function ensureUserWsConnected(session: UserWsSession) {
  if (session.stopped || session.ws)
    return;

  refreshPolymarketUserWsStatus();
  const ws = new WebSocket(resolvePolymarketUserWsUrl());
  session.ws = ws;

  ws.onopen = () => {
    if (session.ws !== ws)
      return;
    session.connected = true;
    sendJson(session, polymarketUserSubscribeMessage(session.auth, [...session.markets]));
    session.pingTimer = setInterval(() => {
      if (session.ws?.readyState === WebSocket.OPEN)
        session.ws.send("PING");
    }, WS_PING_MS);
    refreshPolymarketUserWsStatus();
  };

  ws.onmessage = (event) => {
    if (session.ws !== ws)
      return;
    dispatchUserWsMessage(session, String(event.data));
  };

  ws.onclose = () => {
    if (session.ws !== ws)
      return;
    cleanupSessionTimers(session);
    refreshPolymarketUserWsStatus();
    if (session.skipNextReconnect) {
      session.skipNextReconnect = false;
      return;
    }
    scheduleReconnect(session);
  };

  ws.onerror = () => {
    if (session.ws !== ws)
      return;
    ws.close();
  };
}

/** 账号加载后预连 User WS，避免首笔 delayed 冷启动 */
export function warmPolymarketUserWs(account: PlatformAccount): boolean {
  if (account.provider !== "Polymarket")
    return false;
  const session = getOrCreateSession(account);
  if (!session)
    return false;
  ensureUserWsConnected(session);
  return true;
}

/** 对每个有效 PM 账户（按 apiKey 去重）预连 */
export function warmAllPolymarketUserWs(accounts: readonly PlatformAccount[]): void {
  const warmedKeys = new Set<string>();
  for (const account of accounts) {
    if (account.provider !== "Polymarket" || account.pause)
      continue;
    const key = sessionKeyFromAccount(account);
    if (!key || warmedKeys.has(key))
      continue;
    if (warmPolymarketUserWs(account))
      warmedKeys.add(key);
  }
}

/** delayed 下单后立即注册；conditionId = bet.SourceBetID */
export function registerPolymarketOrderWatch(
  account: PlatformAccount,
  orderId: string,
  opts: { conditionId: string; timeoutMs?: number },
): void {
  const id = String(orderId ?? "").trim();
  const conditionId = String(opts.conditionId ?? "").trim();
  if (!id || !conditionId)
    return;
  if (orderWatches.has(id))
    return;

  const session = getOrCreateSession(account);
  if (!session)
    return;

  let resolve!: (value: PolymarketWsSettleResult | null) => void;
  const promise = new Promise<PolymarketWsSettleResult | null>((res) => {
    resolve = res;
  });

  const entry: WatchEntry = {
    promise,
    settled: false,
    result: null,
    resolve,
  };
  orderWatches.set(id, entry);

  const timeoutMs = opts.timeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS;
  setTimeout(() => {
    if (entry.settled)
      return;
    entry.settled = true;
    entry.result = null;
    resolve(null);
  }, timeoutMs);

  subscribeMarketOnSession(session, conditionId);
}

/** 拒单检测：等待已注册的 WS watch；无 watch 或超时 unresolved 返回 null → 走 REST 轮询 */
export async function awaitPolymarketOrderWatch(
  orderId: string,
): Promise<PolymarketWsSettleResult | null> {
  const id = String(orderId ?? "").trim();
  if (!id)
    return null;
  const entry = orderWatches.get(id);
  if (!entry)
    return null;
  if (entry.settled)
    return entry.result;
  return entry.promise;
}

export function clearPolymarketOrderWatch(orderId: string): void {
  const id = String(orderId ?? "").trim();
  if (id)
    orderWatches.delete(id);
}

export { getPmUserWsSourceMode, pmUserWsSourceModeLabel };
export type { PmUserWsSourceMode };

export function cyclePmUserWsSourceModeAndReconnect(): PmUserWsSourceMode {
  const next = cyclePmUserWsSourceMode();
  for (const session of sessions.values())
    forceReconnectSession(session);
  refreshPolymarketUserWsStatus();
  return next;
}

/** 单测 / 调试：断开所有 User WS */
export function stopAllPolymarketUserWs(): void {
  orderWatches.clear();
  void import("./settlementJob.js")
    .then(m => m.clearPolymarketSettlementJobs())
    .catch(() => {});
  void import("./pmHeartbeat.js")
    .then(m => m.stopAllPolymarketHeartbeats())
    .catch(() => {});
  for (const session of sessions.values()) {
    session.stopped = true;
    if (session.reconnectTimer)
      clearTimeout(session.reconnectTimer);
    cleanupSessionTimers(session);
    session.ws?.close();
  }
  sessions.clear();
  refreshPolymarketUserWsStatus();
}
