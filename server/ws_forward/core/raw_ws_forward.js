import { WebSocketServer, WebSocket } from "ws";
import { recordConnect, recordDisconnect, recordError } from "./forward_stats.js";
import { attachRawPipeBackpressure, pauseWsSocket } from "./ws_backpressure.js";

/** @type {import("ws").WebSocketServer | null} */
let wss = null;
/** @type {import("./types.js").RawWsForwardDefinition[]} */
let definitions = [];

function matchDefinition(pathname) {
  return definitions.find(
    (d) => pathname === d.browserPath || pathname.startsWith(`${d.browserPath}/`),
  );
}

function pipeSockets(clientWs, upstreamWs, id, pendingClientMessages = []) {
  const closeBoth = (reason) => {
    try {
      clientWs.close();
    } catch {
      /* ignore */
    }
    try {
      upstreamWs.close();
    } catch {
      /* ignore */
    }
    if (reason) console.warn(`[ws_forward/${id}] relay closed:`, reason);
  };

  const { toUpstream, toClient } = attachRawPipeBackpressure(clientWs, upstreamWs, id);

  const forwardClientToUpstream = (data, isBinary) => {
    if (toUpstream.canSend(upstreamWs))
      upstreamWs.send(data, { binary: isBinary });
  };

  for (const { data, isBinary } of pendingClientMessages) {
    forwardClientToUpstream(data, isBinary);
  }

  clientWs.on("message", (data, isBinary) => forwardClientToUpstream(data, isBinary));
  upstreamWs.on("message", (data, isBinary) => {
    if (toClient.canSend(clientWs)) {
      clientWs.send(data, { binary: isBinary });
      return;
    }
    // 立刻 pause，避免同一轮事件循环里继续把上游帧灌进 JS
    pauseWsSocket(upstreamWs);
  });
  clientWs.on("close", () => closeBoth());
  clientWs.on("error", () => closeBoth());
  upstreamWs.on("close", () => closeBoth());
  upstreamWs.on("error", () => closeBoth());
}

/**
 * @param {import("node:http").Server} httpServer
 * @param {import("./types.js").RawWsForwardDefinition[]} defs
 */
export function attachRawWsForwards(httpServer, defs) {
  definitions = defs;
  if (!defs.length) return;

  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    const definition = matchDefinition(pathname);
    if (!definition) return;

    let upstreamSpec;
    try {
      upstreamSpec = definition.resolveUpstream(request);
    } catch (err) {
      console.warn(`[ws_forward/${definition.id}] resolveUpstream:`, err.message);
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      /** @type {{ data: import("ws").RawData; isBinary: boolean }[]} */
      const pendingClientMessages = [];
      const onEarlyClientMessage = (data, isBinary) => {
        pendingClientMessages.push({ data, isBinary });
      };
      clientWs.on("message", onEarlyClientMessage);

      let upstreamWs;
      try {
        upstreamWs = new WebSocket(upstreamSpec.url, {
          headers: upstreamSpec.headers,
          rejectUnauthorized: true,
        });
      } catch (err) {
        clientWs.off("message", onEarlyClientMessage);
        console.warn(`[ws_forward/${definition.id}] upstream open failed:`, err.message);
        clientWs.close();
        return;
      }

      upstreamWs.on("open", () => {
        clientWs.off("message", onEarlyClientMessage);
        recordConnect(definition.id);
        console.info(`[ws_forward/${definition.id}] upstream connected`, upstreamSpec.url);
        pipeSockets(clientWs, upstreamWs, definition.id, pendingClientMessages);
      });
      upstreamWs.on("error", (err) => {
        recordError(definition.id, err.message);
        console.warn(`[ws_forward/${definition.id}] upstream error:`, err.message);
        clientWs.close();
      });
      clientWs.on("close", () => recordDisconnect(definition.id));
      upstreamWs.on("close", () => recordDisconnect(definition.id));
    });
  });

  for (const d of defs) {
    console.info(`[ws_forward] ${d.id} raw-ws path ${d.browserPath}`);
  }
}

export function closeRawWsForwards() {
  wss?.close();
  wss = null;
  definitions = [];
}
