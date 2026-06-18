import { io, type Socket } from "socket.io-client";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { IA_A8_COLLECT } from "./a8Collect";
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

function normalizeGateway(gateway: string): string {
  return gateway.replace(/\/+$/, "");
}

/** A8 `wQe`：浏览器直连 47.115.75.57/esport/ws/IA（不经本地 relay / Electron IPC） */
export function createIaRealtimeClient(
  gateway: string = IA_DEFAULT_GATEWAY,
): IaRealtimeClient {
  let socket: Socket | null = null;
  const origin = normalizeGateway(gateway);

  return {
    async start(onMessage) {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;

      resetDirectRealtimeStatus(PLATFORM);

      socket = io(IA_A8_WS, {
        transports: ["websocket"],
        withCredentials: true,
        path: IA_WS_PATH,
        extraHeaders: {
          Origin: origin,
          token: "hello",
        },
        auth: {
          token: origin,
        },
      });

      socket.on("connect", () => {
        patchDirectRealtimeStatus(PLATFORM, {
          upstreamConnected: true,
          upstreamRoute: "a8",
          lastError: null,
        });
        console.info("[IA] connected (direct)", IA_A8_WS, "origin=", origin);
        socket?.emit("RoomJoin", IA_ROOM_JOIN);
        socket?.on("roomMessageCallBack", (message: unknown) => {
          bumpDirectRealtimeMessage(PLATFORM);
          onMessage((message ?? {}) as IaRealtimeMessage);
        });
      });

      socket.on("disconnect", () => {
        patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, upstreamRoute: null });
      });

      socket.on("connect_error", (err: Error) => {
        patchDirectRealtimeStatus(PLATFORM, {
          upstreamConnected: false,
          upstreamRoute: null,
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

/** A8 `wQe` 默认 gateway（与 HTTP 采集对象 `t` 同源） */
export const IA_A8_REALTIME_GATEWAY = IA_A8_COLLECT.gateway;
