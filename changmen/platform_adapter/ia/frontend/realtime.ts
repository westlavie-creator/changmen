import { io, type Socket } from "socket.io-client";
import { relayWsUrl } from "@/shared/platform";

const IA_WS_PATH = "/esport/ws/IA";

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

function getElectronIaRelay() {
  if (typeof window === "undefined") return null;
  return window.gamebetRelays?.ia ?? null;
}

function createElectronIaRealtimeClient(): IaRealtimeClient {
  const relay = getElectronIaRelay();
  let removeMessageListener: (() => void) | null = null;

  return {
    async start(onMessage) {
      removeMessageListener?.();
      removeMessageListener = relay?.onMessage((payload) => {
        onMessage((payload ?? {}) as IaRealtimeMessage);
      }) ?? null;
      return relay?.start();
    },
    async stop() {
      removeMessageListener?.();
      removeMessageListener = null;
      return relay?.stop();
    },
    status: () => relay?.status() ?? Promise.resolve({ platform: "IA", upstreamConnected: false }),
  };
}

function createWebIaRealtimeClient(): IaRealtimeClient {
  let socket: Socket | null = null;

  return {
    async start(onMessage) {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;

      const relayFull = relayWsUrl(IA_WS_PATH);
      const relayBase = relayFull.slice(0, relayFull.length - IA_WS_PATH.length);
      const relay = io(relayBase, {
        transports: ["websocket"],
        path: IA_WS_PATH,
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 8000,
      });

      relay.on("connect", () => {
        relay.emit("RoomJoin", { room_type: "room_type_index_content_push" });
      });
      relay.on("roomMessageCallBack", (message: unknown) => {
        onMessage((message ?? {}) as IaRealtimeMessage);
      });
      socket = relay;
    },
    async stop() {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    },
  };
}

export function createIaRealtimeClient(): IaRealtimeClient {
  if (getElectronIaRelay()) return createElectronIaRealtimeClient();
  return createWebIaRealtimeClient();
}
