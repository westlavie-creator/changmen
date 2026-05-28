"use strict";

const WebSocket = require("ws");
const { WebSocketServer } = require("ws");

const WS_PATH = "/esport/ws/TF";

function buildTfUpstreamUrl(gateway, token, combo = false) {
  const host = gateway.replace(/^https:\/\/api-v4/i, "wss://ws").replace(/^http/i, "ws");
  const base = host.startsWith("ws") ? host : `wss://${host.replace(/^\/\//, "")}`;
  const auth = String(token || "").replace(/^Token\s+/i, "");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}auth_token=${encodeURIComponent(auth)}&combo=${combo ? "true" : "false"}`;
}

class TfWsRelay {
  constructor(options = {}) {
    this.gateway = options.gateway || process.env.TF_GATEWAY || "";
    this.token = options.token || process.env.TF_TOKEN || "";
    this.wss = new WebSocketServer({ noServer: true });
    this.stats = {
      platform: "TF",
      path: WS_PATH,
      upstreamConnected: false,
      downstreamClients: 0,
      messagesRelayed: 0,
      lastError: null,
      lastUpstreamAt: null,
      note: "TF upstream requires TF_GATEWAY + TF_TOKEN",
    };
    this._setupWss();
  }

  paths() {
    return [WS_PATH, `${WS_PATH}/`];
  }

  handleUpgrade(request, socket, head) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  _setupWss() {
    this.wss.on("connection", (clientWs, request) => {
      this.stats.downstreamClients = this.wss.clients.size;

      if (!this.gateway || !this.token) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: "TF proxy: set TF_GATEWAY and TF_TOKEN on server",
          })
        );
        clientWs.close(1011, "TF not configured");
        return;
      }

      const url = new URL(request.url, "http://127.0.0.1");
      const authToken = url.searchParams.get("auth_token") || this.token;
      const combo = url.searchParams.get("combo") === "true";
      const upstreamUrl = buildTfUpstreamUrl(this.gateway, authToken, combo);

      const upstream = new WebSocket(upstreamUrl);
      let upstreamOpen = false;

      upstream.on("open", () => {
        upstreamOpen = true;
        this.stats.upstreamConnected = true;
      });

      upstream.on("message", (data, isBinary) => {
        this.stats.messagesRelayed += 1;
        this.stats.lastUpstreamAt = Date.now();
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      upstream.on("error", (err) => {
        this.stats.lastError = err.message;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, err.message);
        }
      });

      upstream.on("close", () => {
        this.stats.upstreamConnected = false;
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      });

      clientWs.on("message", (data, isBinary) => {
        if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        }
      });

      clientWs.on("close", () => {
        this.stats.downstreamClients = this.wss.clients.size;
        upstream.close();
      });

      clientWs.on("error", (err) => {
        this.stats.lastError = err.message;
        upstream.close();
      });
    });
  }

  async start() {
    /* per-client upstream; nothing to warm up */
  }

  async stop() {
    for (const client of this.wss.clients) client.close();
  }

  getStatus() {
    this.stats.downstreamClients = this.wss.clients.size;
    return { ...this.stats };
  }
}

module.exports = { TfWsRelay, WS_PATH, buildTfUpstreamUrl };
