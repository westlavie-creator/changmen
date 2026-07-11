import { reportVenueWsStatus } from "@venue/shared/venueWsStatus";

import type { PredictOrderbookData } from "./parse";
import { resolvePredictFunApiKey } from "./transport";
import { resolvePredictFunMarketWsUrl } from "./wsConfig";
import { isVenueHkEgressEnabled } from "@venue/shared/venueHkEgress";

const WS_RECONNECT_MS = 5_000;
const HEARTBEAT_TOPIC = "heartbeat";

export type PredictWsStatus = "disconnected" | "connecting" | "connected" | "error";
type PredictWsStatusListener = (status: PredictWsStatus) => void;

let predictWsStatus: PredictWsStatus = "disconnected";
const predictWsStatusListeners = new Set<PredictWsStatusListener>();

function setPredictWsStatus(status: PredictWsStatus) {
  predictWsStatus = status;
  reportVenueWsStatus("predictfun-market", status);
  for (const fn of predictWsStatusListeners)
    fn(status);
}

export function getPredictWsStatus(): PredictWsStatus {
  return predictWsStatus;
}

export function onPredictWsStatus(fn: PredictWsStatusListener): () => void {
  predictWsStatusListeners.add(fn);
  return () => predictWsStatusListeners.delete(fn);
}

export interface PredictOrderbookUpdate {
  marketId?: string;
  orderbook?: PredictOrderbookData;
}

export interface PredictMarketWsHandle {
  subscribeMarketIds: (ids: string[]) => void;
  stop: () => void;
}

interface PredictWsMessage {
  type?: string;
  topic?: string;
  data?: PredictOrderbookData;
  requestId?: number;
  success?: boolean;
}

function buildDirectWsUrl(): string {
  const base = resolvePredictFunMarketWsUrl();
  // HK ws-forward：上游 API Key 由 VPS .env 注入，浏览器 URL 不带 query
  if (isVenueHkEgressEnabled())
    return base;
  const apiKey = resolvePredictFunApiKey();
  if (!apiKey)
    return base;
  const url = new URL(base);
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

/** [Predict 官方] wss://ws.predict.fun/ws，topic: predictOrderbook/{marketId} */
export function startPredictMarketWs(opts: {
  onOrderbook: (update: PredictOrderbookUpdate) => void;
}): PredictMarketWsHandle {
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingIds: string[] = [];
  let requestId = 1;

  function sendSubscribe(ids: string[]) {
    if (!socket || socket.readyState !== WebSocket.OPEN || !ids.length)
      return;
    for (const id of ids) {
      socket.send(JSON.stringify({
        method: "subscribe",
        requestId: requestId++,
        params: [`predictOrderbook/${id}`],
      }));
    }
  }

  function handleMessage(raw: string) {
    let payload: PredictWsMessage;
    try {
      payload = JSON.parse(raw) as PredictWsMessage;
    }
    catch {
      return;
    }
    if (payload.type === "M" && payload.topic === HEARTBEAT_TOPIC) {
      socket?.send(JSON.stringify({
        method: "heartbeat",
        requestId: requestId++,
        params: [payload.data ?? {}],
      }));
      return;
    }
    if (payload.type !== "M" || !payload.topic?.startsWith("predictOrderbook/"))
      return;
    const marketId = payload.topic.slice("predictOrderbook/".length);
    if (!marketId || !payload.data)
      return;
    opts.onOrderbook({ marketId, orderbook: payload.data });
  }

  function connect() {
    if (stopped)
      return;
    setPredictWsStatus("connecting");
    socket = new WebSocket(buildDirectWsUrl());

    socket.onopen = () => {
      setPredictWsStatus("connected");
      sendSubscribe(pendingIds);
    };

    socket.onmessage = (event) => {
      try {
        handleMessage(String(event.data));
      }
      catch (err) {
        console.warn("[PredictFun WS] message handler error", err);
      }
    };

    socket.onerror = () => {
      setPredictWsStatus("error");
    };

    socket.onclose = () => {
      socket = null;
      setPredictWsStatus(stopped ? "disconnected" : "error");
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer)
      return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, WS_RECONNECT_MS);
  }

  connect();

  return {
    subscribeMarketIds(ids: string[]) {
      pendingIds = [...new Set(ids.filter(Boolean))];
      sendSubscribe(pendingIds);
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
      setPredictWsStatus("disconnected");
    },
  };
}
