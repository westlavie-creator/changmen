/**
 * OB 体育推送（足球 Tab 专用）。
 * 显式 wss 优先；否则用 HTTP 网关推导 /yewuws2/push（九游/OB 体育 PC 同规则）。
 * 禁止复用电竞 MQTT 与电竞 OB 通道。
 */
import { reportVenueWsStatus, type VenueWsStatus } from "@changmen/venue-adapter/shared";

export const OB_SPORT_WS_ID = "ob-sport";
/** 九游/OB 体育 PC worker：API_PREFIX_WBSOCKET + /push */
export const OB_SPORT_WS_PATH = "/yewuws2/push";
const HEARTBEAT_MS = 15_000;

export type ObSportSessionLite = {
  token?: string;
  gateway?: string;
  wsUrl?: string;
  sessionId?: string;
};

export type ObSportWsHandle = {
  sync: (oids: string[]) => void;
  stop: () => void;
};

const RECONNECT_MS = 5_000;

function setStatus(status: VenueWsStatus) {
  reportVenueWsStatus(OB_SPORT_WS_ID, status);
}

function hkToDecimal(hk: number): number {
  const n = Number(hk);
  if (!Number.isFinite(n) || n === 0)
    return 0;
  if (n > 0)
    return Math.round((1 + n) * 1000) / 1000;
  return Math.round((1 + 1 / Math.abs(n)) * 1000) / 1000;
}

export function looksLikeMqttUrl(url: string): boolean {
  return /mqtt/i.test(String(url || ""));
}

/**
 * https://api.xxx → wss://api.xxx/yewuws2/push?requestId=token
 * [九游/OB 体育 PC] worker: url.replace("http","ws") + /yewuws2/push + ?requestId
 */
export function deriveObSportPushUrl(gateway: string, token: string): string {
  const gw = String(gateway || "").trim();
  const tok = String(token || "").trim();
  if (!gw || !tok)
    return "";
  try {
    const u = new URL(gw);
    if (u.protocol !== "http:" && u.protocol !== "https:")
      return "";
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    const q = new URLSearchParams();
    q.set("requestId", tok);
    return `${proto}//${u.host}${OB_SPORT_WS_PATH}?${q}`;
  }
  catch {
    return "";
  }
}

function withRequestId(wsUrl: string, token: string): string {
  const tok = String(token || "").trim();
  try {
    const u = new URL(wsUrl);
    if (!u.searchParams.get("requestId") && tok)
      u.searchParams.set("requestId", tok);
    return u.toString();
  }
  catch {
    return wsUrl;
  }
}

export function resolveObSportWsUrl(session: ObSportSessionLite | null | undefined): string {
  const token = String(session?.token || "").trim();
  const explicit = String(session?.wsUrl || "").trim();
  if (/^wss?:\/\//i.test(explicit) && !looksLikeMqttUrl(explicit))
    return withRequestId(explicit, token);
  return deriveObSportPushUrl(String(session?.gateway || ""), token);
}

/** 源站推送里抽出 oid + 欧赔（港水 ov2 / 欧赔 ov） */
export function parseObSportPushOdds(msg: unknown): Array<{ oid: string; odds: number }> {
  const out: Array<{ oid: string; odds: number }> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object")
      return;
    const row = node as Record<string, unknown>;
    const oid = String(row.oid ?? row.oddId ?? "");
    const ov2 = row.ov2 ?? row.hk;
    const ov = row.ov ?? row.odds;
    if (oid) {
      let decimal = 0;
      if (ov2 != null && ov2 !== "")
        decimal = hkToDecimal(Number(ov2));
      else if (ov != null)
        decimal = Number(ov) > 1 ? Number(ov) : hkToDecimal(Number(ov));
      if (decimal > 0)
        out.push({ oid, odds: decimal });
    }
    for (const v of Object.values(row)) {
      if (Array.isArray(v)) {
        for (const item of v)
          walk(item);
      }
      else if (v && typeof v === "object")
        walk(v);
    }
  };
  walk(msg);
  return out;
}

function decodePayload(raw: unknown): unknown {
  if (raw == null)
    return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    }
    catch {
      return null;
    }
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(raw)) {
    try {
      return JSON.parse(new TextDecoder().decode(raw as Uint8Array));
    }
    catch {
      return null;
    }
  }
  if (typeof raw === "object")
    return raw;
  return null;
}

/**
 * @param onQuote oid → 欧赔；只应写入 sportOddsStore
 */
export function startObSportWs(
  getSession: () => ObSportSessionLite | null | undefined,
  onQuote: (oid: string, decimalOdds: number) => void,
): ObSportWsHandle {
  let ws: WebSocket | null = null;
  let wanted = new Set<string>();
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let activeUrl = "";
  let activeToken = "";

  const emitQuotes = (parsed: unknown) => {
    for (const q of parseObSportPushOdds(parsed)) {
      if (wanted.size && !wanted.has(q.oid))
        continue;
      onQuote(q.oid, q.odds);
    }
  };

  const clearReconnect = () => {
    if (!reconnectTimer)
      return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const stopHeartbeat = () => {
    if (!heartbeatTimer)
      return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const sendJson = (socket: WebSocket, payload: Record<string, unknown>) => {
    if (socket.readyState !== 1)
      return;
    try {
      socket.send(JSON.stringify(payload));
    }
    catch { /* ignore */ }
  };

  const disconnect = () => {
    clearReconnect();
    stopHeartbeat();
    if (ws && ws.readyState === 1 && activeToken) {
      sendJson(ws, { cmd: "C00", requestId: activeToken });
    }
    try {
      ws?.close();
    }
    catch { /* ignore */ }
    ws = null;
    activeUrl = "";
    activeToken = "";
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer)
      return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  };

  const connectJsonWs = (url: string, token: string) => {
    setStatus("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    }
    catch {
      setStatus("error");
      scheduleReconnect();
      return;
    }
    ws = socket;
    activeUrl = url;
    activeToken = token;
    socket.addEventListener("open", () => {
      if (stopped || ws !== socket)
        return;
      setStatus("connected");
      stopHeartbeat();
      if (token) {
        sendJson(socket, { cmd: "C0", requestId: token });
        heartbeatTimer = setInterval(() => {
          if (ws !== socket)
            return;
          sendJson(socket, { cmd: "C0", requestId: token });
        }, HEARTBEAT_MS);
      }
    });
    socket.addEventListener("message", (ev) => {
      if (stopped || ws !== socket)
        return;
      const parsed = decodePayload(ev.data);
      if (parsed)
        emitQuotes(parsed);
    });
    socket.addEventListener("error", () => {
      if (ws !== socket)
        return;
      setStatus("error");
    });
    socket.addEventListener("close", () => {
      if (ws !== socket)
        return;
      stopHeartbeat();
      ws = null;
      activeUrl = "";
      activeToken = "";
      if (stopped) {
        setStatus("disconnected");
        return;
      }
      setStatus("error");
      scheduleReconnect();
    });
  };

  const connect = () => {
    if (stopped)
      return;
    const session = getSession();
    const url = resolveObSportWsUrl(session);
    if (!url) {
      disconnect();
      setStatus("disconnected");
      return;
    }
    if (looksLikeMqttUrl(url)) {
      disconnect();
      setStatus("error");
      return;
    }
    if (activeUrl === url && (ws?.readyState === 0 || ws?.readyState === 1))
      return;
    disconnect();
    connectJsonWs(url, String(session?.token || "").trim());
  };

  return {
    sync(oids: string[]) {
      if (stopped)
        return;
      wanted = new Set(oids.filter(Boolean));
      connect();
    },
    stop() {
      stopped = true;
      wanted = new Set();
      disconnect();
      setStatus("disconnected");
    },
  };
}
