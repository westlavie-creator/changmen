import { Server } from "socket.io";
import { io as ioClient } from "socket.io-client";
import { listPlatformForwards } from "../platforms/registry.js";
import { IA_DEFAULT_GATEWAY } from "../platforms/ia.js";

/** @type {import("socket.io").Server[]} */
const servers = [];

/**
 * @param {import("node:http").Server} httpServer
 */
export function attachForwardEngine(httpServer) {
  for (const definition of listPlatformForwards()) {
    const io = new Server(httpServer, {
      path: definition.browserPath,
      transports: ["websocket"],
      cors: { origin: true, credentials: true },
      serveClient: false,
    });

    io.on("connection", (browserSocket) => {
      const gateway =
        (typeof browserSocket.handshake.auth?.token === "string" &&
          browserSocket.handshake.auth.token) ||
        IA_DEFAULT_GATEWAY;
      const { url, options } = definition.buildUpstream(gateway);
      const upstream = ioClient(url, options);
      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        upstream.removeAllListeners();
        upstream.disconnect();
      };

      const forwardToUpstream = (event, ...args) => {
        const send = () => upstream.emit(event, ...args);
        if (upstream.connected) send();
        else upstream.once("connect", send);
      };

      browserSocket.onAny((event, ...args) => {
        if (event === "disconnect") return;
        forwardToUpstream(event, ...args);
      });

      upstream.onAny((event, ...args) => {
        if (event === "disconnect" || event === "connect" || event === "connect_error") return;
        browserSocket.emit(event, ...args);
      });

      upstream.on("connect", () => {
        console.info(`[ws_forward/${definition.id}] upstream connected`, url);
      });

      upstream.on("connect_error", (err) => {
        console.warn(`[ws_forward/${definition.id}] upstream connect_error:`, err.message);
        browserSocket.disconnect(true);
        cleanup();
      });

      upstream.on("disconnect", () => {
        if (!closed) browserSocket.disconnect(true);
        cleanup();
      });

      browserSocket.on("disconnect", cleanup);
    });

    servers.push(io);
    console.info(`[ws_forward] ${definition.id} browser path ${definition.browserPath}`);
  }
}

export function closeForwardEngine() {
  for (const io of servers) io.close();
  servers.length = 0;
}
