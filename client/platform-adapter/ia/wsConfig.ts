import { resolveChangmenWsBase } from "@platform/shared/changmenWsBase";
import { IA_A8_COLLECT } from "./a8Collect";



/** IA 官网 Socket.IO [pingtai_offical IA/index-07cde062.js 可证实] */

export const IA_OFFICIAL_WS = "wss://socket.ajj123.net";

export const IA_OFFICIAL_WS_PATH = "/socket.io";



/** A8 `wQe` [A8 可证实]：IA Socket.IO 聚合入口 */

export const IA_A8_WS = "wss://47.115.75.57";

export const IA_A8_WS_PATH = "/esport/ws/IA";



/** CHANGMEN 服务端转发（`server/ws_forward`） */

export const IA_WS_FORWARD_PATH = "/esport/ws-forward/IA";



/** 兼容旧引用 */

export const IA_WS_PATH = IA_A8_WS_PATH;



export const IA_WS_CONNECT_TIMEOUT_MS = 15_000;



/** A8 `wQe` 内联 `t.gateway` */

export const IA_DEFAULT_GATEWAY = IA_A8_COLLECT.gateway;



export const IA_ROOM_JOIN = { room_type: "room_type_index_content_push" } as const;



export type IaWsEndpointSource = "official" | "changmen" | "a8";



/** A8 `wQe` 形 Socket.IO 选项（CHANGMEN / A8 共用，仅 url/path 不同） */

export type IaWsA8ShapeOptions = {

  withCredentials: true;

  extraHeaders: { Origin: string; token: "hello" };

  auth: { token: string };

};



export type IaWsConnectConfig = {

  url: string;

  path: string;

  source: IaWsEndpointSource;

  extraHeaders?: Record<string, string>;

  auth: Record<string, string>;

  withCredentials?: boolean;

};



/** A8 `wQe`：`extraHeaders` + `auth`（CHANGMEN 与 A8 出口一致） */

export function buildIaWsA8ShapeOptions(gateway: string = IA_DEFAULT_GATEWAY): IaWsA8ShapeOptions {

  const origin = gateway.replace(/\/+$/, "");

  return {

    withCredentials: true,

    extraHeaders: { Origin: origin, token: "hello" },

    auth: { token: origin },

  };

}



/** 官网：`auth.token` = localStorage `token` 或 `"123"`；path `/socket.io`（仅官方直连） */

export function getIaOfficialWsConfig(gateway: string = IA_DEFAULT_GATEWAY): IaWsConnectConfig {

  let token = "123";

  if (typeof localStorage !== "undefined") {

    const stored = localStorage.getItem("token");

    if (stored) token = stored;

  }

  const origin = gateway.replace(/\/+$/, "");

  return {

    url: IA_OFFICIAL_WS,

    path: IA_OFFICIAL_WS_PATH,

    source: "official",

    withCredentials: true,

    extraHeaders: { Origin: origin },

    auth: { token },

  };

}



/** CHANGMEN：服务端代连官方，浏览器侧与 A8 同形 handshake */

export function getIaChangmenWsConfig(

  gateway: string = IA_DEFAULT_GATEWAY,

  baseUrl: string = resolveChangmenWsBase(),

): IaWsConnectConfig {

  const shape = buildIaWsA8ShapeOptions(gateway);

  return {

    url: baseUrl.replace(/\/+$/, ""),

    path: IA_WS_FORWARD_PATH,

    source: "changmen",

    ...shape,

  };

}



/** A8 聚合 */

export function getIaA8WsConfig(gateway: string = IA_DEFAULT_GATEWAY): IaWsConnectConfig {

  const shape = buildIaWsA8ShapeOptions(gateway);

  return {

    url: IA_A8_WS,

    path: IA_A8_WS_PATH,

    source: "a8",

    ...shape,

  };

}


