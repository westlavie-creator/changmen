import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { attachWsForward, isWsForwardHttpPath } from "../index.js";
import { createHttpHandler } from "../../backend/http_routes.js";
import { io } from "socket.io-client";

describe("isWsForwardHttpPath", () => {
  it("matches IA forward path", () => {
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/IA"), true);
    assert.equal(isWsForwardHttpPath("/esport/ws-forward/IA/"), true);
    assert.equal(isWsForwardHttpPath("/esport/Client_GetMatchs"), false);
  });
});

describe("ws_forward with backend http handler", () => {
  it("browser connects through createHttpHandler without server error", async () => {
    const port = 3998;
    const serveStatic = (_req, res) => {
      res.writeHead(404);
      res.end("static");
    };
    const server = http.createServer(
      createHttpHandler({ port, serveStatic }),
    );
    attachWsForward(server, { platforms: ["IA"] });

    await new Promise((resolve) => server.listen(port, resolve));

    const result = await new Promise((resolve) => {
      const s = io(`http://127.0.0.1:${port}`, {
        path: "/esport/ws-forward/IA",
        transports: ["websocket"],
        reconnection: false,
        withCredentials: true,
        extraHeaders: { Origin: "https://ilustre-analytics.org", token: "hello" },
        auth: { token: "https://ilustre-analytics.org" },
      });
      const t = setTimeout(() => resolve("timeout"), 15000);
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

    server.close();
    assert.equal(result, "ok");
  });
});
