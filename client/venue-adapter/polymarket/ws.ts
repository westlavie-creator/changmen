import { POLYMARKET_MARKET_WS } from "./api";

const WS_RECONNECT_MS = 5_000;
const WS_PING_MS = 10_000;

export type PolymarketWsStatus = "disconnected" | "connecting" | "connected" | "error";
type PolymarketWsStatusListener = (status: PolymarketWsStatus) => void;

let polymarketWsStatus: PolymarketWsStatus = "disconnected";
const polymarketWsStatusListeners = new Set<PolymarketWsStatusListener>();

function setPolymarketWsStatus(status: PolymarketWsStatus) {
  polymarketWsStatus = status;
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

/**
 * 启动 Polymarket CLOB market WebSocket，自动重连 + PING 心跳。
 * onOpen 在每次连接建立后调用（用于重新订阅资产）。
 * onMessage 接收原始字符串帧（已过滤 PONG）。
 */
export function startPolymarketMarketWs(opts: {
  onMessage: (raw: string) => void;
  onOpen: () => void;
}): PolymarketMarketWsHandle {
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
    ws = new WebSocket(POLYMARKET_MARKET_WS);

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

  return {
    send(msg: string) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
    },
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanup();
      ws?.close();
      setPolymarketWsStatus("disconnected");
    },
  };
}
