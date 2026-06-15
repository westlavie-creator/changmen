import { io, type Socket } from "socket.io-client";
import { getCollectPlatform } from "@/api/esport";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { IA_A8_WS, IA_DEFAULT_GATEWAY, IA_ROOM_JOIN, IA_WS_PATH } from "./wsConfig";

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

async function resolveIaGateway(): Promise<string> {
  const platform = await getCollectPlatform(PLATFORM);
  return String(platform?.Gateway || IA_DEFAULT_GATEWAY).replace(/\/+$/, "");
}

/** A8 CQe：浏览器直连 47.115.75.57/esport/ws/IA（不经本地 relay / Electron IPC） */
function createDirectIaRealtimeClient(): IaRealtimeClient {
  let socket: Socket | null = null;

  return {
    async start(onMessage) {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;

      resetDirectRealtimeStatus(PLATFORM);
      const gateway = await resolveIaGateway();

      socket = io(IA_A8_WS, {
        transports: ["websocket"],
        withCredentials: true,
        path: IA_WS_PATH,
        extraHeaders: {
          Origin: gateway,
          token: "hello",
        },
        auth: {
          token: gateway,
        },
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 8000,
      });

      socket.on("connect", () => {
        patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: true, lastError: null });
        console.info("[IA] connected (direct)", IA_A8_WS, "origin=", gateway);
        socket?.emit("RoomJoin", IA_ROOM_JOIN);
      });

      socket.on("roomMessageCallBack", (message: unknown) => {
        bumpDirectRealtimeMessage(PLATFORM);
        onMessage((message ?? {}) as IaRealtimeMessage);
      });

      socket.on("disconnect", () => {
        patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false });
      });

      socket.on("connect_error", (err: Error) => {
        patchDirectRealtimeStatus(PLATFORM, {
          upstreamConnected: false,
          lastError: err.message,
        });
        console.warn("[IA] connect error", err.message);
      });

      return getDirectRealtimeStatus(PLATFORM);
    },
    async stop() {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
      resetDirectRealtimeStatus(PLATFORM);
      return getDirectRealtimeStatus(PLATFORM);
    },
    async status() {
      return getDirectRealtimeStatus(PLATFORM);
    },
  };
}

export function createIaRealtimeClient(): IaRealtimeClient {
  return createDirectIaRealtimeClient();
}
