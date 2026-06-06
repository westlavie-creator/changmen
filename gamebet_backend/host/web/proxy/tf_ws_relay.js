"use strict";

const WebSocket = require("ws");
const { WebSocketServer } = require("ws");
const { TfRelayCore } = require("../../../relays/tf_relay_core.js");

const WS_PATH = "/esport/ws/TF";

// [A8 可证实] 与 tf_relay_core.js 保持一致：TF WS 走 A8 代理
const { buildTfUpstreamUrl } = require("../../../relays/tf_relay_core.js");

class TfWsRelay {
  constructor(options = {}) {
    this.gateway = options.gateway || process.env.TF_GATEWAY || "";
    this.token   = options.token   || process.env.TF_TOKEN   || "";
    this.wss  = new WebSocketServer({ noServer: true });
    this.core = options.core || new TfRelayCore();
    this.stats = {
      platform: "TF",
      path: WS_PATH,
      upstreamConnected: false,
      downstreamClients: 0,
      messagesRelayed: 0,
      lastError: null,
      lastUpstreamAt: null,
    };

    // 上游消息广播给所有下游 WS 客户端
    this.core.onMessage((text) => {
      this.stats.messagesRelayed += 1;
      this.stats.lastUpstreamAt = Date.now();
      for (const ws of this.wss.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(text);
      }
    });

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

      // 取浏览器 URL 里的 auth_token，或回退到服务端配置 token
      const url = new URL(request.url, "http://127.0.0.1");
      const authToken = url.searchParams.get("auth_token") || this.token;

      // 首个客户端连入时启动共享上游（或重连）
      if (!this.core.getStatus().upstreamConnected) {
        this.core.start(authToken, this.gateway);
      }

      clientWs.on("close", () => {
        this.stats.downstreamClients = this.wss.clients.size;
      });
      clientWs.on("error", (err) => {
        this.stats.lastError = err.message;
      });
    });
  }

  async start() {
    if (this.gateway && this.token) {
      this.core.start(this.token, this.gateway);
    }
  }

  async stop() {
    this.core.stop();
    for (const client of this.wss.clients) client.close();
  }

  getStatus() {
    const cs = this.core.getStatus();
    this.stats.upstreamConnected  = cs.upstreamConnected;
    this.stats.downstreamClients  = this.wss.clients.size;
    this.stats.lastError          = this.stats.lastError || cs.lastError;
    this.stats.lastUpstreamAt     = this.stats.lastUpstreamAt || cs.lastUpstreamAt;
    return { ...this.stats };
  }
}

module.exports = { TfWsRelay, WS_PATH, buildTfUpstreamUrl };
