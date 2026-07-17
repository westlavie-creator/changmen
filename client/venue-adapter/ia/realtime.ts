import { io, type Socket } from "socket.io-client";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
  upstreamRouteFromUrl,
} from "../shared/directRealtimeStatus";
import { PLATFORMS } from "../shared/platforms";
import { IA_A8_COLLECT } from "./a8Collect";
import {
  getIaChangmenWsConfig,
  getIaOfficialWsConfig,
  IA_DEFAULT_GATEWAY,
  IA_ROOM_JOIN,
  IA_WS_CONNECT_TIMEOUT_MS,
  type IaWsConnectConfig,
  type IaWsEndpointSource,
} from "./wsConfig";

const PLATFORM = PLATFORMS.IA;

export type IaRealtimeMessage = Record<string, unknown>;

export type IaRealtimeStatus = {
  platform: string;
  upstreamConnected: boolean;
  messagesReceived?: number;
  lastError?: string | null;
  lastUpstreamAt?: number | null;
};

export type IaRealtimeClient = {
  start(onMessage: (message: IaRealtimeMessage) => void): Promise<IaRealtimeStatus | void>;
  stop(): Promise<IaRealtimeStatus | void>;
  status?(): Promise<IaRealtimeStatus | unknown>;
};

const FAILOVER_ORDER: IaWsEndpointSource[] = ["official", "changmen"];

function nextFailoverConfig(
  failedSource: IaWsEndpointSource,
  gateway: string,
): IaWsConnectConfig | null {
  const idx = FAILOVER_ORDER.indexOf(failedSource);
  const next = idx === -1 ? FAILOVER_ORDER[0]! : FAILOVER_ORDER[(idx + 1) % FAILOVER_ORDER.length]!;
  switch (next) {
    case "official":
      return getIaOfficialWsConfig(gateway);
    case "changmen":
      return getIaChangmenWsConfig(gateway);
    default:
      return null;
  }
}

function createDirectIaRealtimeClient(gateway: string): IaRealtimeClient {
  let socket: Socket | null = null;
  let onMessageHandler: ((message: IaRealtimeMessage) => void) | null = null;
  let activeConfig: IaWsConnectConfig | null = null;
  let stopped = false;
  let failoverBusy = false;
  let intentionalDisconnect = false;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearConnectTimer = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  };

  const tearDownSocket = () => {
    clearConnectTimer();
    if (!socket) return;
    intentionalDisconnect = true;
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    intentionalDisconnect = false;
  };

  const requestFailover = (reason: string) => {
    if (stopped || failoverBusy || intentionalDisconnect) return;
    const failedSource = activeConfig?.source;
    if (!failedSource) return;
    void failoverFrom(failedSource, reason);
  };

  const failoverFrom = async (failedSource: IaWsEndpointSource, reason: string) => {
    if (stopped || failoverBusy) return;
    failoverBusy = true;
    try {
      tearDownSocket();
      activeConfig = null;
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: reason,
      });

      const nextConfig = nextFailoverConfig(failedSource, gateway);
      if (!nextConfig) return;

      console.warn(
        `[IA WS] ${failedSource} failed, switching to ${nextConfig.source}:`,
        reason,
      );
      await connectWithConfig(nextConfig);
    } finally {
      failoverBusy = false;
    }
  };

  const warnOfficialOriginMismatch = (source: IaWsEndpointSource) => {
    if (source !== "official" || typeof location === "undefined") return;
    const expected = gateway.replace(/\/+$/, "");
    if (location.origin === expected) return;
    console.warn(
      "[IA WS] official socket.ajj123.net expects Origin",
      expected,
      "but page is",
      location.origin,
      "— will failover to CHANGMEN",
    );
  };

  const connectWithConfig = async (config: IaWsConnectConfig) => {
    if (stopped) return;

    tearDownSocket();
    activeConfig = config;
    const { url, path, source, extraHeaders, auth, withCredentials } = config;
    warnOfficialOriginMismatch(source);

    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: false,
      upstreamRoute: null,
      lastError: null,
    });

    socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      path,
      ...(withCredentials ? { withCredentials: true } : {}),
      ...(extraHeaders ? { extraHeaders } : {}),
      auth,
    });

    socket.on("connect", () => {
      clearConnectTimer();
      console.info("[IA WS] connected", url, path, `(${source})`);
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: true,
        upstreamRoute: upstreamRouteFromUrl(url, source),
        lastError: null,
      });
      socket?.emit("RoomJoin", IA_ROOM_JOIN);
      socket?.on("roomMessageCallBack", (message: unknown) => {
        bumpDirectRealtimeMessage(PLATFORM);
        onMessageHandler?.((message ?? {}) as IaRealtimeMessage);
      });
    });

    socket.on("disconnect", () => {
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, upstreamRoute: null });
      if (!intentionalDisconnect) requestFailover("connection closed");
    });

    socket.on("connect_error", (err: Error) => {
      console.warn("[IA WS] connect error", err.message, url, `(${source})`);
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: err.message,
      });
      requestFailover(err.message);
    });

    connectTimer = setTimeout(() => {
      if (stopped || socket?.connected) return;
      console.warn("[IA WS] connect timeout", url, `(${source})`);
      requestFailover("connect timeout");
    }, IA_WS_CONNECT_TIMEOUT_MS);
  };

  return {
    async start(onMessage) {
      onMessageHandler = onMessage;
      stopped = false;

      if (socket?.connected) return getDirectRealtimeStatus(PLATFORM);

      await connectWithConfig(getIaOfficialWsConfig(gateway));
      return getDirectRealtimeStatus(PLATFORM);
    },
    async stop() {
      stopped = true;
      tearDownSocket();
      onMessageHandler = null;
      activeConfig = null;
      resetDirectRealtimeStatus(PLATFORM);
      return getDirectRealtimeStatus(PLATFORM);
    },
    async status() {
      return getDirectRealtimeStatus(PLATFORM);
    },
  };
}

/** 官网 → CHANGMEN 转发 */
export function createIaRealtimeClient(gateway: string = IA_DEFAULT_GATEWAY): IaRealtimeClient {
  return createDirectIaRealtimeClient(gateway);
}

/** A8 `wQe` 默认 gateway（与 HTTP 采集对象 `t` 同源） */
export const IA_A8_REALTIME_GATEWAY = IA_A8_COLLECT.gateway;

