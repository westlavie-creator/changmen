import {
  bumpDirectRealtimeMessage,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { tfWsAuthToken } from "./auth";
import { buildTfDirectWsUrl } from "./wsConfig";

const PLATFORM = PLATFORMS.TF;

const WS_RECONNECT_MIN_MS = 1000;
const WS_RECONNECT_MAX_MS = 5000;
const WS_RECONNECT_GROW = 1.3;

export type TfWsOddsPayload = {
  data?: { market_id?: string; selection?: Array<Record<string, unknown>> };
};

/**
 * A8 NBe：ReconnectingWebSocket（min 1s / max 5s）。
 * 浏览器直连 wss://47.115.75.57/esport/ws/TF（不经本地 relay / Electron IPC）。
 */
export function startTfOddsWs(opts: {
  getToken: () => Promise<string | undefined>;
  onMessage: (payload: TfWsOddsPayload) => void;
  onError: () => void;
}): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryMs = WS_RECONNECT_MIN_MS;

  const scheduleReconnect = () => {
    if (stopped) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, retryMs);
    retryMs = Math.min(Math.floor(retryMs * WS_RECONNECT_GROW), WS_RECONNECT_MAX_MS);
  };

  const connect = async () => {
    if (stopped) return;

    const token = await opts.getToken();
    if (!token) {
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
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

    const url = buildTfDirectWsUrl(tfWsAuthToken(token));
    patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, lastError: null });
    ws = new WebSocket(url);

    ws.onopen = () => {
      retryMs = WS_RECONNECT_MIN_MS;
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: true, lastError: null });
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
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        lastError: "ws error",
      });
      opts.onError();
      ws?.close();
    };

    ws.onclose = () => {
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false });
      ws = null;
      scheduleReconnect();
    };
  };

  void connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = null;
    resetDirectRealtimeStatus(PLATFORM);
  };
}
