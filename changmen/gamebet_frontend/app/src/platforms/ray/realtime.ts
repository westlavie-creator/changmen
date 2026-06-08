import socketClusterClient from "socketcluster-client";
import { relayWsUrl } from "@/shared/platform";

const RAY_SC_PATH = "/esport/ws/RAY";

export type RayRealtimeMessage = {
  source?: "odds" | "match" | string;
  odds?: Array<Record<string, unknown>>;
  match?: unknown;
};

export type RayRealtimeClient = {
  start(onMessage: (message: RayRealtimeMessage) => void): Promise<void>;
  stop(): Promise<void>;
  status?(): Promise<unknown>;
};

function getElectronRayRelay() {
  if (typeof window === "undefined") return null;
  return window.gamebetRelays?.ray ?? null;
}

function createElectronRayRealtimeClient(): RayRealtimeClient {
  const relay = getElectronRayRelay();
  let removeMessageListener: (() => void) | null = null;

  return {
    async start(onMessage) {
      removeMessageListener?.();
      removeMessageListener = relay?.onMessage((payload) => onMessage(payload as RayRealtimeMessage)) ?? null;
      await relay?.start();
    },
    async stop() {
      removeMessageListener?.();
      removeMessageListener = null;
      await relay?.stop();
    },
    status: () => relay?.status() ?? Promise.resolve({ platform: "RAY", upstreamConnected: false }),
  };
}

function createWebRayRealtimeClient(): RayRealtimeClient {
  let socket: ReturnType<typeof socketClusterClient.create> | null = null;
  let stopped = false;

  return {
    async start(onMessage) {
      stopped = false;
      socket = createWebSocketClusterClient();
      const channel = socket.subscribe("match");
      await channel.listener("subscribe").once();

      void (async () => {
        try {
          for await (const msg of channel) {
            if (stopped) break;
            onMessage(msg as RayRealtimeMessage);
          }
        } catch (err) {
          if (!stopped) console.warn("[RAY] ws loop", err);
        }
      })();
    },
    async stop() {
      stopped = true;
      socket?.disconnect();
      socket = null;
    },
  };
}

/** A8 `bQe`：dev 连 127.0.0.1:3456；生产连同源 relay */
function createWebSocketClusterClient(): ReturnType<typeof socketClusterClient.create> {
  if (import.meta.env.DEV) {
    const url = new URL(relayWsUrl(RAY_SC_PATH));
    const port = Number(url.port) || (url.protocol === "wss:" ? 443 : 80);
    return socketClusterClient.create({
      hostname: url.hostname,
      protocolVersion: 1,
      secure: url.protocol === "wss:",
      port,
      path: url.pathname,
      autoConnect: true,
      ackTimeout: 10_000,
    });
  }
  const port = Number(location.port) || (location.protocol === "https:" ? 443 : 80);
  return socketClusterClient.create({
    hostname: location.hostname,
    protocolVersion: 1,
    secure: location.protocol === "https:",
    port,
    path: RAY_SC_PATH,
    autoConnect: true,
    ackTimeout: 10_000,
  });
}

export function createRayRealtimeClient(): RayRealtimeClient {
  if (getElectronRayRelay()) return createElectronRayRealtimeClient();
  return createWebRayRealtimeClient();
}
