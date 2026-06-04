import { relayWsUrl } from "@/shared/platform";
import { tfWsAuthToken } from "./auth";

const WS_RECONNECT_MIN_MS = 1000;
const WS_RECONNECT_MAX_MS = 5000;
const WS_RECONNECT_GROW = 1.3;

export type TfWsOddsPayload = {
  data?: { market_id?: string; selection?: Array<Record<string, unknown>> };
};

type TfRelayApi = {
  start: (token: string) => Promise<unknown>;
  stop: () => Promise<unknown>;
  onMessage: (cb: (text: string) => void) => () => void;
};

function tfIpcRelay(): TfRelayApi | null {
  const api = (window as unknown as { gamebetRelays?: { tf?: TfRelayApi | null } })
    .gamebetRelays?.tf;
  return api ?? null;
}

/**
 * A8 NBe：ReconnectingWebSocket（min 1s / max 5s）。
 * Electron packaged 模式：经 IPC → TfRelayCore（main process）直连 TF 上游。
 * Web / Electron dev 模式：经本地 relay /esport/ws/TF 转发。
 */
export function startTfOddsWs(opts: {
  getToken: () => Promise<string | undefined>;
  onMessage: (payload: TfWsOddsPayload) => void;
  onError: () => void;
}): () => void {
  const api = tfIpcRelay();

  // ── Electron IPC 路径 ────────────────────────────────────────────────────
  if (api) {
    let removeListener: (() => void) | null = null;

    removeListener = api.onMessage((text) => {
      let payload: TfWsOddsPayload;
      try {
        payload = JSON.parse(text);
      } catch {
        return;
      }
      opts.onMessage(payload);
    });

    void (async () => {
      const token = await opts.getToken();
      if (token) await api.start(token);
    })();

    return () => {
      removeListener?.();
      void api.stop();
    };
  }

  // ── Web / Electron dev：WS relay 路径 ───────────────────────────────────
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
      scheduleReconnect();
      return;
    }

    try { ws?.close(); } catch { /* ignore */ }

    const auth = encodeURIComponent(tfWsAuthToken(token));
    const url = relayWsUrl(`/esport/ws/TF?auth_token=${auth}&combo=false`);
    ws = new WebSocket(url);

    ws.onopen = () => { retryMs = WS_RECONNECT_MIN_MS; };

    ws.onmessage = (ev) => {
      let payload: TfWsOddsPayload;
      try {
        payload = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      opts.onMessage(payload);
    };

    ws.onerror = () => {
      opts.onError();
      ws?.close();
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };
  };

  void connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;
  };
}
