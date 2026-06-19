import { WebSocketServer, WebSocket } from "ws";

/** @type {import("ws").WebSocketServer | null} */
let wss = null;
/** @type {import("./types.js").RawWsForwardDefinition[]} */
let definitions = [];

function matchDefinition(pathname) {
  return definitions.find(
    (d) => pathname === d.browserPath || pathname.startsWith(`${d.browserPath}/`),
  );
}

function pipeSockets(clientWs, upstreamWs, id) {
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

  clientWs.on("message", (data, isBinary) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
    }
  });
  upstreamWs.on("message", (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
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
      let upstreamWs;
      try {
        upstreamWs = new WebSocket(upstreamSpec.url, {
          headers: upstreamSpec.headers,
          rejectUnauthorized: true,
        });
      } catch (err) {
        console.warn(`[ws_forward/${definition.id}] upstream open failed:`, err.message);
        clientWs.close();
        return;
      }

      upstreamWs.on("open", () => {
        console.info(`[ws_forward/${definition.id}] upstream connected`, upstreamSpec.url);
        pipeSockets(clientWs, upstreamWs, definition.id);
      });
      upstreamWs.on("error", (err) => {
        console.warn(`[ws_forward/${definition.id}] upstream error:`, err.message);
        clientWs.close();
      });
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
