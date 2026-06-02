"use strict";

const WebSocket = require("ws");
const { WebSocketServer } = require("ws");

const WS_PATH = "/esport/ws/IA";
const DEFAULT_UPSTREAM_BASE = "wss://47.115.75.57";

/**
 * IA Socket.IO 透明 WS 隧道。
 * 浏览器以 Socket.IO（EIO=4 websocket）连入，relay 以相同协议透传到上游，
 * 并在连上游时注入 Origin / token header（浏览器无法直接设置）。
 */
class IaWsRelay {
  constructor(options = {}) {
    this.upstreamBase =
      options.upstreamBase || process.env.IA_WS_URL || DEFAULT_UPSTREAM_BASE;
    this.gateway =
      options.gateway || process.env.IA_GATEWAY || "https://ilustre-analytics.org";
    this.wss = new WebSocketServer({ noServer: true });
    this.stats = {
      platform: "IA",
      path: WS_PATH,
      upstreamConnected: false,
      downstreamClients: 0,
      messagesRelayed: 0,
      lastError: null,
      lastUpstreamAt: null,
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

      // 保留原始 path + query（EIO=4&transport=websocket 等 Socket.IO 握手参数）
      const suffix = request.url || `${WS_PATH}/`;
      const upstreamUrl = `${this.upstreamBase}${suffix}`;
      const origin = this.gateway.replace(/\/+$/, "");

      const upstream = new WebSocket(upstreamUrl, {
        headers: {
          Origin: origin,
          token: "hello",
        },
        rejectUnauthorized: false,
      });

      upstream.on("open", () => {
        this.stats.upstreamConnected = true;
        console.log("[IA WS relay] upstream open", upstreamUrl);
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
        console.warn("[IA WS relay] upstream error:", err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, err.message);
        }
      });

      upstream.on("close", () => {
        this.stats.upstreamConnected = false;
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      });

      clientWs.on("message", (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) {
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
    /* 每个下游连接各自建上游，无需预热 */
  }

  async stop() {
    for (const client of this.wss.clients) client.close();
  }

  getStatus() {
    this.stats.downstreamClients = this.wss.clients.size;
    return { ...this.stats };
  }
}

module.exports = { IaWsRelay, WS_PATH };
