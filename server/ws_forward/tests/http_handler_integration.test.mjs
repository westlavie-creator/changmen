import { afterAll, describe, it } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { attachWsForward, closeWsForward, isWsForwardHttpPath } from "../index.js";
import { createHttpHandler } from "../../backend/http_routes.js";
import { io } from "socket.io-client";
import WebSocket, { WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const socketClusterClient = require("socketcluster-client");

function listenHttp(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

function listenWs(wss) {
  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      const addr = wss.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

function onceOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const t = setTimeout(() => reject(new Error("ws open timeout")), 15_000);
    ws.once("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

function onceMessage(ws) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws message timeout")), 15_000);
    ws.once("message", (data) => {
      clearTimeout(t);
      resolve(String(data));
    });
    ws.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

/** @type {{ server: import("node:http").Server; forwardPort: number; obUpstream: WebSocketServer; obUpstreamPort: number }} */
const ctx = await (async () => {
  const obUpstream = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const obUpstreamPort = await listenWs(obUpstream);
  obUpstream.on("connection", (ws) => {
    ws.on("message", (data) => {
      ws.send(`echo:${String(data)}`);
    });
  });

  const serveStatic = (_req, res) => {
    res.writeHead(404);
    res.end("static");
  };
  const server = http.createServer(createHttpHandler({ port: 0, serveStatic }));
  attachWsForward(server, { platforms: ["IA", "OB", "RAY"] });
  const forwardPort = await listenHttp(server);
  return { server, forwardPort, obUpstream, obUpstreamPort };
})();

afterAll(async () => {
  await new Promise((resolve) => ctx.obUpstream.close(() => resolve()));
  await new Promise((resolve) => ctx.server.close(() => resolve()));
  closeWsForward();
});

describe("isWsForwardHttpPath", () => {
  it("matches IA forward path", () => {
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/IA"), true);
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/IA/"), true);
    assert.equal(isWsForwardHttpPath("/esport/Client_GetMatchs"), false);
  });

  it("matches OB and RAY forward paths", () => {
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/OB"), true);
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/RAY"), true);
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/OB/"), true);
  });
});

describe("ws_forward with backend http handler", () => {
  it("IA: browser connects through createHttpHandler without server error", async () => {
    const result = await new Promise((resolve) => {
      const s = io(`http://127.0.0.1:${ctx.forwardPort}`, {
        path: "/esport/ws-forward/IA",
        transports: ["websocket"],
        reconnection: false,
        withCredentials: true,
        extraHeaders: { Origin: "https://ilustre-analytics.org", token: "hello" },
        auth: { token: "https://ilustre-analytics.org" },
      });
      const t = setTimeout(() => resolve("timeout"), 15_000);
      s.on("connect", () => {
        clearTimeout(t);
        s.disconnect();
        resolve("ok");
      });
      s.on("connect_error", (e) => {
        clearTimeout(t);
        resolve(`err:${e.message}`);
      });
    });

    assert.equal(result, "ok");
  });

  it("OB: raw-ws forward pipes bidirectionally to ?u= upstream", async () => {
    const upstreamUrl = `ws://127.0.0.1:${ctx.obUpstreamPort}`;
    const forwardUrl = `ws://127.0.0.1:${ctx.forwardPort}/esport/ws-forward/OB?u=${encodeURIComponent(upstreamUrl)}`;
    const client = new WebSocket(forwardUrl);

    await onceOpen(client);
    await new Promise((r) => setTimeout(r, 200));
    client.send("ping");
    const reply = await onceMessage(client);
    assert.equal(reply, "echo:ping");
    client.close();
  });

  it("OB: rejects forward without u query", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${ctx.forwardPort}/esport/ws-forward/OB`);
    const result = await new Promise((resolve) => {
      const t = setTimeout(() => resolve("timeout"), 5_000);
      client.once("open", () => {
        clearTimeout(t);
        client.close();
        resolve("opened");
      });
      client.once("error", () => {
        clearTimeout(t);
        resolve("error");
      });
      client.once("close", () => {
        clearTimeout(t);
        resolve("closed");
      });
    });
    assert.notEqual(result, "opened");
  });

  it("RAY: raw-ws forward connects to official cfsocket upstream", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${ctx.forwardPort}/esport/ws-forward/RAY`, {
      headers: {
        Origin: "https://ray164.com",
        Referer: "https://ray164.com/",
        Authorization:
          "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcHBfa2V5IjoiY2QyNzZmZTQ5YmEyZTQ1YiIsImRhdGEiOnsidXNlcl9uYW1lIjoiaHVhMTk5NDMxIiwibG9iYnlfdXJsIjoiLyMvbG9naW4vIiwiaWF0IjoiNjM4NTQwNjkyOTkifX0.Y1k61j-43efe0UonN4mfpVMLvaSlFZihGeLCxYV4tKM",
      },
    });

    await onceOpen(client);
    client.close();
  });

  it("RAY: socketcluster handshake succeeds through forward", async () => {
    const token =
      "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcHBfa2V5IjoiY2QyNzZmZTQ5YmEyZTQ1YiIsImRhdGEiOnsidXNlcl9uYW1lIjoiaHVhMTk5NDMxIiwibG9iYnlfdXJsIjoiLyMvbG9naW4vIiwiaWF0IjoiNjM4NTQwNjkyOTkifX0.Y1k61j-43efe0UonN4mfpVMLvaSlFZihGeLCxYV4tKM";
    const result = await new Promise((resolve) => {
      const socket = socketClusterClient.create({
        hostname: "127.0.0.1",
        port: ctx.forwardPort,
        secure: false,
        path: "/esport/ws-forward/RAY",
        protocolVersion: 1,
        autoConnect: true,
        connectTimeout: 15_000,
        ackTimeout: 10_000,
        wsOptions: {
          headers: {
            Origin: "https://ray164.com",
            Referer: "https://ray164.com/",
            Authorization: token,
          },
        },
      });
      const t = setTimeout(() => {
        socket.disconnect();
        resolve("timeout");
      }, 15_000);
      void (async () => {
        for await (const _ of socket.listener("connect")) {
          clearTimeout(t);
          socket.disconnect();
          resolve("ok");
          break;
        }
      })();
      void (async () => {
        for await (const event of socket.listener("error")) {
          clearTimeout(t);
          socket.disconnect();
          resolve(`err:${event?.error?.message || event}`);
          break;
        }
      })();
    });

    assert.equal(result, "ok");
  });
});
