/**
 * Polymarket 体育 MARKET WS（独立于电竞 `ws.ts`）。
 * - 固定连 PM-SPORT-MARKET hub，不读写电竞 singleton / official 切换
 * - 不调用 setPmMarketWsSourceMode / setPmUserWsSourceMode（避免交叉影响电竞）
 */

import { reportVenueWsStatus } from "../shared/venueWsStatus";
import { resolvePolymarketSportMarketWsUrl } from "./sportWsConfig";

const WS_RECONNECT_MS = 5_000;
const WS_PING_MS = 10_000;

export interface PolymarketSportMarketWsHandle {
  send: (msg: string) => void;
  stop: () => void;
}

type SportMarketWsOpts = {
  onMessage: (raw: string) => void;
  onOpen: () => void;
};

type SportWsStatus = "disconnected" | "connecting" | "connected" | "error";

let activeSportHandle: PolymarketSportMarketWsHandle | null = null;

function setSportStatus(status: SportWsStatus) {
  reportVenueWsStatus("pm-sport-market", status);
}

function createSportMarketWs(opts: SportMarketWsOpts): PolymarketSportMarketWsHandle {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function clearPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer)
      return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, WS_RECONNECT_MS);
  }

  function connect() {
    if (stopped || ws)
      return;
    setSportStatus("connecting");
    const socket = new WebSocket(resolvePolymarketSportMarketWsUrl());
    ws = socket;

    socket.onopen = () => {
      if (ws !== socket)
        return;
      setSportStatus("connected");
      opts.onOpen();
      clearPing();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN)
          ws.send("PING");
      }, WS_PING_MS);
    };

    socket.onmessage = (event) => {
      if (ws !== socket)
        return;
      const raw = String(event.data);
      if (raw === "PONG")
        return;
      if (!raw.trim().startsWith("{") && !raw.trim().startsWith("["))
        return;
      try {
        opts.onMessage(raw);
      }
      catch (err) {
        console.warn("[Polymarket Sport WS] parse error", err);
      }
    };

    socket.onclose = () => {
      if (ws !== socket)
        return;
      clearPing();
      ws = null;
      if (stopped) {
        setSportStatus("disconnected");
        return;
      }
      setSportStatus("error");
      scheduleReconnect();
    };

    socket.onerror = () => {
      if (ws !== socket)
        return;
      setSportStatus("error");
      socket.close();
    };
  }

  connect();

  const handle: PolymarketSportMarketWsHandle = {
    send(msg: string) {
      if (ws?.readyState === WebSocket.OPEN)
        ws.send(msg);
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      clearPing();
      const socket = ws;
      ws = null;
      try {
        socket?.close();
      }
      catch {
        /* ignore */
      }
      setSportStatus("disconnected");
      if (activeSportHandle === handle)
        activeSportHandle = null;
    },
  };

  return handle;
}

/** 启动体育 MARKET WS；不触碰电竞 `startPolymarketMarketWs` / activeMarketWsHandle。 */
export function startPolymarketSportMarketWs(opts: SportMarketWsOpts): PolymarketSportMarketWsHandle {
  activeSportHandle?.stop();
  const handle = createSportMarketWs(opts);
  activeSportHandle = handle;
  return handle;
}
