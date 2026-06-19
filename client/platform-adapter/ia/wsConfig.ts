import { IA_A8_COLLECT } from "./a8Collect";

/** IA 官网 Socket.IO [pingtai_offical IA/index-07cde062.js 可证实] */
export const IA_OFFICIAL_WS = "wss://socket.ajj123.net";
export const IA_OFFICIAL_WS_PATH = "/socket.io";

/** A8 `wQe` [A8 可证实]：IA Socket.IO 聚合入口 */
export const IA_A8_WS = "wss://47.115.75.57";
export const IA_A8_WS_PATH = "/esport/ws/IA";

/** 兼容旧引用 */
export const IA_WS_PATH = IA_A8_WS_PATH;

export const IA_WS_CONNECT_TIMEOUT_MS = 15_000;

/** A8 `wQe` 内联 `t.gateway` */
export const IA_DEFAULT_GATEWAY = IA_A8_COLLECT.gateway;

export const IA_ROOM_JOIN = { room_type: "room_type_index_content_push" } as const;

export type IaWsEndpointSource = "official" | "a8";

export type IaWsConnectConfig = {
  url: string;
  path: string;
  source: IaWsEndpointSource;
  extraHeaders?: Record<string, string>;
  auth: Record<string, string>;
  withCredentials?: boolean;
};

/** 官网：`auth.token` = localStorage `token` 或 `"123"` */
export function getIaOfficialWsConfig(): IaWsConnectConfig {
  let token = "123";
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("token");
    if (stored) token = stored;
  }
  return {
    url: IA_OFFICIAL_WS,
    path: IA_OFFICIAL_WS_PATH,
    source: "official",
    auth: { token },
  };
}

/** A8 聚合：`Origin` + `auth.token` = 采集 gateway（ilustre） */
export function getIaA8WsConfig(gateway: string = IA_DEFAULT_GATEWAY): IaWsConnectConfig {
  const origin = gateway.replace(/\/+$/, "");
  return {
    url: IA_A8_WS,
    path: IA_A8_WS_PATH,
    source: "a8",
    withCredentials: true,
    extraHeaders: { Origin: origin, token: "hello" },
    auth: { token: origin },
  };
}
