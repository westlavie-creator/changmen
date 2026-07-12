import { RAY_A8_COLLECT, RAY_WS } from "./a8Collect";
import { resolveChangmenWsBase } from "../shared/changmenWsBase";

/** A8 `bQe` oqe [A8 可证实] */
export const RAY_A8_WS = {
  hostname: "47.115.75.57",
  path: "/esport/ws/RAY",
  secure: true,
  port: 443,
} as const;

export const RAY_WS_FORWARD_PATH = "/esport/ws-forward/RAY";

export const RAY_WS_CONNECT_TIMEOUT_MS = 15_000;
export const RAY_SC_CHANNEL = RAY_WS.channel;

export type RayWsEndpointSource = "official" | "changmen" | "a8";

export type RayScConnectConfig = {
  hostname: string;
  port: number;
  secure: boolean;
  path: string;
  source: RayWsEndpointSource;
  wsOptions: {
    headers: {
      Origin: string;
      Referer: string;
      Authorization: string;
    };
  };
};

function rayAuthHeader(): string {
  const token = RAY_A8_COLLECT.token;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function buildRayWsHeaders(): RayScConnectConfig["wsOptions"] {
  return {
    headers: {
      Origin: RAY_WS.origin,
      Referer: `${RAY_WS.origin}/`,
      Authorization: rayAuthHeader(),
    },
  };
}

/** 官网 cfsocket.365raylinks.com */
export function getRayOfficialScConfig(): RayScConnectConfig {
  return {
    hostname: RAY_WS.hostname,
    port: 443,
    secure: true,
    path: RAY_WS.path,
    source: "official",
    wsOptions: buildRayWsHeaders(),
  };
}

/** CHANGMEN 服务端中继（注入官方 Origin/Authorization） */
export function getRayChangmenScConfig(): RayScConnectConfig {
  const base = new URL(resolveChangmenWsBase());
  const port = base.port ? Number(base.port) : base.protocol === "https:" ? 443 : 80;
  return {
    hostname: base.hostname,
    port,
    secure: base.protocol === "https:",
    path: RAY_WS_FORWARD_PATH,
    source: "changmen",
    wsOptions: buildRayWsHeaders(),
  };
}

/** A8 聚合 47.115.75.57/esport/ws/RAY */
export function getRayA8ScConfig(): RayScConnectConfig {
  return {
    hostname: RAY_A8_WS.hostname,
    port: RAY_A8_WS.port,
    secure: RAY_A8_WS.secure,
    path: RAY_A8_WS.path,
    source: "a8",
    wsOptions: buildRayWsHeaders(),
  };
}
