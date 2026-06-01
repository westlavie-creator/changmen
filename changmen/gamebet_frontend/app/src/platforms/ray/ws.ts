import socketClusterClient from "socketcluster-client";
import { relayWsUrl } from "@/shared/platform";

const RAY_SC_PATH = "/esport/ws/RAY";

/** A8 `bQe`：dev 连 127.0.0.1:3456；生产连同源 relay */
export function createRayScClient(): ReturnType<typeof socketClusterClient.create> {
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
