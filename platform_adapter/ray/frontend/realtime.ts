import socketClusterClient from "socketcluster-client";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { RAY_A8_COLLECT, RAY_WS } from "./a8Collect";

const PLATFORM = PLATFORMS.RAY;
const RAY_SC_CHANNEL = RAY_WS.channel;

export type RayRealtimeMessage = {
  source?: "odds" | "match" | string;
  odds?: Array<Record<string, unknown>>;
  match?: unknown;
};

export type RayRealtimeStatus = {
  platform: string;
  upstreamConnected: boolean;
  messagesReceived?: number;
  lastError?: string | null;
  lastUpstreamAt?: number | null;
};

export type RayRealtimeClient = {
  start(onMessage: (message: RayRealtimeMessage) => void): Promise<void>;
  stop(): Promise<void>;
  status?(): Promise<RayRealtimeStatus>;
};

function watchRaySocketState(
  socket: ReturnType<typeof socketClusterClient.create>,
  stopped: () => boolean,
): void {
  void (async () => {
    for await (const _ of socket.listener("connect")) {
      if (stopped()) break;
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: true, lastError: null });
      console.info("[RAY] connected (direct)", RAY_WS.hostname);
    }
  })();

  void (async () => {
    for await (const _ of socket.listener("disconnect")) {
      if (stopped()) break;
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false });
    }
  })();

  void (async () => {
    for await (const event of socket.listener("error")) {
      if (stopped()) break;
      const message =
        event && typeof event === "object" && "error" in event
          ? String((event as { error?: unknown }).error ?? event)
          : String(event ?? "ws error");
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, lastError: message });
      console.warn("[RAY] ws error", message);
    }
  })();
}

/** A8 bQe：浏览器直连 cfsocket.365raylinks.com（不经 /esport/ws/RAY relay） */
function createDirectRayRealtimeClient(): RayRealtimeClient {
  let socket: ReturnType<typeof socketClusterClient.create> | null = null;
  let stopped = false;

  return {
    async start(onMessage) {
      stopped = false;
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, lastError: null });

      const token = RAY_A8_COLLECT.token;
      const auth = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

      socket = socketClusterClient.create({
        hostname: RAY_WS.hostname,
        secure: true,
        port: 443,
        path: RAY_WS.path,
        protocolVersion: 1,
        autoConnect: true,
        connectTimeout: 15_000,
        ackTimeout: 10_000,
        wsOptions: {
          headers: {
            Origin: RAY_WS.origin,
            Referer: `${RAY_WS.origin}/`,
            Authorization: auth,
          },
        },
      });

      watchRaySocketState(socket, () => stopped);

      const channel = socket.subscribe(RAY_SC_CHANNEL);
      await channel.listener("subscribe").once();
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: true, lastError: null });

      void (async () => {
        try {
          for await (const msg of channel) {
            if (stopped) break;
            bumpDirectRealtimeMessage(PLATFORM);
            onMessage(msg as RayRealtimeMessage);
          }
        } catch (err) {
          if (!stopped) {
            const message = err instanceof Error ? err.message : String(err);
            patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, lastError: message });
            console.warn("[RAY] ws loop", err);
          }
        }
      })();
    },
    async stop() {
      stopped = true;
      socket?.disconnect();
      socket = null;
      resetDirectRealtimeStatus(PLATFORM);
    },
    async status() {
      return getDirectRealtimeStatus(PLATFORM);
    },
  };
}

export function createRayRealtimeClient(): RayRealtimeClient {
  return createDirectRayRealtimeClient();
}
