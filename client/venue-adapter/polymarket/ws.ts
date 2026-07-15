import { reportVenueWsStatus } from "../shared/venueWsStatus";
import { resolvePolymarketMarketWsUrl } from "./wsConfig";
import {
  cyclePmMarketWsSourceMode,
  getPmMarketWsSourceMode,
  pmMarketWsSourceModeLabel,
  type PmMarketWsSourceMode,
} from "./pmMarketWsMode";

const WS_RECONNECT_MS = 5_000;
const WS_PING_MS = 10_000;

export type PolymarketWsStatus = "disconnected" | "connecting" | "connected" | "error";
type PolymarketWsStatusListener = (status: PolymarketWsStatus) => void;

let polymarketWsStatus: PolymarketWsStatus = "disconnected";
const polymarketWsStatusListeners = new Set<PolymarketWsStatusListener>();

function setPolymarketWsStatus(status: PolymarketWsStatus) {
  polymarketWsStatus = status;
  reportVenueWsStatus("pm-market", status);
  for (const fn of polymarketWsStatusListeners) fn(status);
}

export function getPolymarketWsStatus(): PolymarketWsStatus {
  return polymarketWsStatus;
}

export function onPolymarketWsStatus(fn: PolymarketWsStatusListener): () => void {
  polymarketWsStatusListeners.add(fn);
  return () => polymarketWsStatusListeners.delete(fn);
}

export interface PolymarketMarketWsHandle {
  send: (msg: string) => void;
  stop: () => void;
}

type MarketWsOpts = {
  onMessage: (raw: string) => void;
  onOpen: () => void;
};

/** 真实连接；cycle 换线会替换此引用 */
let activeMarketWsHandle: PolymarketMarketWsHandle | null = null;
let activeMarketWsOpts: MarketWsOpts | null = null;

function createPolymarketMarketWs(opts: MarketWsOpts): PolymarketMarketWsHandle {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    ws = null;
  }

  function clearActiveIfSelf(handle: PolymarketMarketWsHandle) {
    if (activeMarketWsHandle !== handle)
      return;
    activeMarketWsHandle = null;
    activeMarketWsOpts = null;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, WS_RECONNECT_MS);
  }

  function connect() {
    if (stopped || ws) return;
    setPolymarketWsStatus("connecting");
    ws = new WebSocket(resolvePolymarketMarketWsUrl());

    ws.onopen = () => {
      setPolymarketWsStatus("connected");
      opts.onOpen();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send("PING");
      }, WS_PING_MS);
    };

    ws.onmessage = (event) => {
      const raw = String(event.data);
      if (raw === "PONG") return;
      if (!raw.trim().startsWith("{") && !raw.trim().startsWith("[")) return;
      try {
        opts.onMessage(raw);
      } catch (err) {
        console.warn("[Polymarket WS] parse error", err);
      }
    };

    ws.onclose = () => {
      cleanup();
      setPolymarketWsStatus(stopped ? "disconnected" : "error");
      scheduleReconnect();
    };

    ws.onerror = () => {
      setPolymarketWsStatus("error");
      ws?.close();
    };
  }

  connect();

  const handle: PolymarketMarketWsHandle = {
    send(msg: string) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
    },
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanup();
      ws?.close();
      setPolymarketWsStatus("disconnected");
      clearActiveIfSelf(handle);
    },
  };

  return handle;
}

/**
 * 稳定门面：collector 闭包持有此对象；cycle 换线只换底层 active，send 仍有效。
 * （否则 onOpen → subscribeTrackedAssets → 旧 handle.send 静默丢订阅，电竞/体育断价）
 */
function createMarketWsFacade(): PolymarketMarketWsHandle {
  return {
    send(msg: string) {
      activeMarketWsHandle?.send(msg);
    },
    stop() {
      activeMarketWsHandle?.stop();
    },
  };
}

/**
 * 启动 Polymarket CLOB market WebSocket，自动重连 + PING 心跳。
 * onOpen 在每次连接建立后调用（用于重新订阅资产）。
 * onMessage 接收原始字符串帧（已过滤 PONG）。
 */
export function startPolymarketMarketWs(opts: MarketWsOpts): PolymarketMarketWsHandle {
  activeMarketWsHandle?.stop();
  activeMarketWsOpts = opts;
  activeMarketWsHandle = createPolymarketMarketWs(opts);
  return createMarketWsFacade();
}

export { getPmMarketWsSourceMode, pmMarketWsSourceModeLabel };
export type { PmMarketWsSourceMode };

export function cyclePmMarketWsSourceModeAndReconnect(): PmMarketWsSourceMode {
  const next = cyclePmMarketWsSourceMode();
  const opts = activeMarketWsOpts;
  if (!opts)
    return next;

  activeMarketWsHandle?.stop();
  activeMarketWsOpts = opts;
  activeMarketWsHandle = createPolymarketMarketWs(opts);
  return next;
}
