import {
  bumpDirectRealtimeMessage,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
  upstreamRouteFromUrl,
} from "../shared/directRealtimeStatus";
import { PLATFORMS } from "../shared/platforms";
import { tfWsAuthToken } from "./auth";
import {
  buildTfWsUrl,
  TF_WS_CONNECTION_TIMEOUT_MS,
  TF_WS_RECONNECT_MAX_MS,
  TF_WS_RECONNECT_MIN_MS,
} from "./wsConfig";

const PLATFORM = PLATFORMS.TF;

const WS_RECONNECT_GROW = 1.3;

export type TfWsOddsPayload = {
  data?: { market_id?: string; selection?: Array<Record<string, unknown>> };
};

/**
 * A8 `h4e` + `c4e`：ReconnectingWebSocket（connectionTimeout 4s，重连 1s–5s）。
 * 浏览器直连 `wss://{api.a8.to|47.115.75.57}/esport/ws/TF`（不经本地 relay）。
 */
export function startTfOddsWs(opts: {
  getToken: () => Promise<string | undefined>;
  onMessage: (payload: TfWsOddsPayload) => void;
  onError: () => void;
}): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryMs = TF_WS_RECONNECT_MIN_MS;

  const clearConnectTimer = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, retryMs);
    retryMs = Math.min(Math.floor(retryMs * WS_RECONNECT_GROW), TF_WS_RECONNECT_MAX_MS);
  };

  const connect = async () => {
    if (stopped) return;

    const token = await opts.getToken();
    if (!token) {
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: "no token",
      });
      scheduleReconnect();
      return;
    }

    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    clearConnectTimer();

    const url = buildTfWsUrl(tfWsAuthToken(token));
    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: false,
      upstreamRoute: null,
      lastError: null,
    });
    ws = new WebSocket(url);

    connectTimer = setTimeout(() => {
      if (ws?.readyState !== WebSocket.OPEN) {
        patchDirectRealtimeStatus(PLATFORM, {
          upstreamConnected: false,
          upstreamRoute: null,
          lastError: "ws connect timeout",
        });
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      }
    }, TF_WS_CONNECTION_TIMEOUT_MS);

    ws.onopen = () => {
      clearConnectTimer();
      retryMs = TF_WS_RECONNECT_MIN_MS;
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: true,
        upstreamRoute: upstreamRouteFromUrl(url),
        lastError: null,
      });
      console.info("[TF] connected (direct)", url.replace(/auth_token=([^&]{0,8})[^&]*/, "auth_token=$1…"));
    };

    ws.onmessage = (ev) => {
      let payload: TfWsOddsPayload;
      try {
        payload = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      bumpDirectRealtimeMessage(PLATFORM);
      opts.onMessage(payload);
    };

    ws.onerror = () => {
      clearConnectTimer();
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: "ws error",
      });
      opts.onError();
      ws?.close();
    };

    ws.onclose = () => {
      clearConnectTimer();
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, upstreamRoute: null });
      ws = null;
      scheduleReconnect();
    };
  };

  void connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearConnectTimer();
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = null;
    resetDirectRealtimeStatus(PLATFORM);
  };
}
