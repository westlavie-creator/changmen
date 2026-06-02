import socketClusterClient from "socketcluster-client";
import { relayWsUrl } from "@/shared/platform";

const RAY_SC_PATH = "/esport/ws/RAY";

function createElectronRayScClient() {
  let stopped = false;
  let removeMessageListener: (() => void) | null = null;
  const queue: unknown[] = [];
  const waiters: Array<(result: IteratorResult<unknown>) => void> = [];

  const push = (payload: unknown) => {
    if (stopped) return;
    const waiter = waiters.shift();
    if (waiter) {
      waiter({ value: payload, done: false });
      return;
    }
    queue.push(payload);
  };

  removeMessageListener = window.gamebetRelays?.ray.onMessage(push) ?? null;
  void window.gamebetRelays?.ray.start();

  return {
    subscribe(_channel: string) {
      return {
        listener(event: string) {
          return {
            once: async () => {
              if (event === "subscribe") await window.gamebetRelays?.ray.start();
            },
          };
        },
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<unknown>> {
              if (queue.length) {
                return Promise.resolve({ value: queue.shift(), done: false });
              }
              if (stopped) return Promise.resolve({ value: undefined, done: true });
              return new Promise((resolve) => waiters.push(resolve));
            },
          };
        },
      };
    },
    disconnect() {
      stopped = true;
      removeMessageListener?.();
      removeMessageListener = null;
      while (waiters.length) {
        waiters.shift()?.({ value: undefined, done: true });
      }
      void window.gamebetRelays?.ray.stop();
    },
  };
}

/** A8 `bQe`：dev 连 127.0.0.1:3456；生产连同源 relay */
export function createRayScClient(): ReturnType<typeof socketClusterClient.create> {
  if (window.gamebetRelays?.ray) {
    return createElectronRayScClient() as ReturnType<typeof socketClusterClient.create>;
  }
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
