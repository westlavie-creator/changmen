import {
  parseMlbSportMessage,
  sportLookupKey,
  type MlbSportLive,
  type MlbSportWsMessage,
} from "@/lib/mlbSport";

export const MLB_SPORTS_WS = "wss://sports-api.polymarket.com/ws";
const RECONNECT_MS = 5_000;

export interface MlbSportsWsFeed {
  start: () => void;
  stop: () => void;
  readonly connected: () => boolean;
}

export function createMlbSportsWsFeed(
  onUpdate: (snapshot: MlbSportLive) => void,
  onConnectionChange?: (connected: boolean) => void,
): MlbSportsWsFeed {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let isConnected = false;

  function setConnected(next: boolean): void {
    if (isConnected === next)
      return;
    isConnected = next;
    onConnectionChange?.(next);
  }

  function handleMessage(raw: string): void {
    if (raw === "ping") {
      ws?.send("pong");
      return;
    }
    let msg: MlbSportWsMessage;
    try {
      msg = JSON.parse(raw) as MlbSportWsMessage;
    }
    catch {
      return;
    }
    const snapshot = parseMlbSportMessage(msg);
    if (!snapshot || !sportLookupKey(snapshot))
      return;
    onUpdate(snapshot);
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer)
      return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_MS);
  }

  function connect(): void {
    if (stopped || ws)
      return;

    ws = new WebSocket(MLB_SPORTS_WS);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      handleMessage(String(event.data));
    };

    ws.onclose = () => {
      ws = null;
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      ws?.close();
      ws = null;
      setConnected(false);
    },
    connected() {
      return isConnected;
    },
  };
}
