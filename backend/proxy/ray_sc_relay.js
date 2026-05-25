"use strict";

const { AGServer } = require("socketcluster-server");
const { RayWsClient } = require("../platforms/ray/ray_ws.js");
const { login } = require("../platforms/ray/ray_session.js");
const { syncRayFromSession } = require("../esport-api/platform_sync.js");

const WS_PATH = "/esport/ws/RAY";

class RayScRelay {
  constructor(options = {}) {
    this.options = options;
    this.agServer = null;
    this.wsClient = null;
    this.stats = {
      platform: "RAY",
      path: WS_PATH,
      upstreamConnected: false,
      downstreamClients: 0,
      messagesRelayed: 0,
      lastError: null,
      lastUpstreamAt: null,
    };
  }

  paths() {
    return [WS_PATH, `${WS_PATH}/`];
  }

  /** 使用 noServer，避免 ws 库拦截 /esport/ws/OB 等非 RAY 路径 */
  attach(_httpServer) {
    this.httpServer = _httpServer;
    this.agServer = new AGServer({
      path: WS_PATH,
      protocolVersion: 1,
      wsEngineServerOptions: { noServer: true },
    });
  }

  handleUpgrade(request, socket, head) {
    if (!this.agServer?.wsServer) return;
    this.agServer.wsServer.handleUpgrade(request, socket, head, (ws) => {
      this.agServer.wsServer.emit("connection", ws, request);
    });
  }

  _countSockets() {
    try {
      return this.agServer?.clientsCount ?? 0;
    } catch {
      return 0;
    }
  }

  async start() {
    let session = null;
    try {
      session = await login(this.options);
      syncRayFromSession(session);
    } catch (err) {
      this.stats.lastError = err.message;
    }

    const token = session?.token || this.options.token;
    const origin = session?.origin || this.options.origin;

    this.wsClient = new RayWsClient({
      hostname: this.options.hostname,
      path: this.options.path,
      channel: this.options.channel,
      token,
      origin,
    });

    this.wsClient.onOdds((odds, envelope) => {
      this._transmit(envelope || { source: "odds", odds });
    });

    this.wsClient.onMatch((match, envelope) => {
      this._transmit(envelope || { source: "match", match });
    });

    const ok = await this.wsClient.connect();
    this.stats.upstreamConnected = Boolean(ok);
    if (!ok) {
      this.stats.lastError = this.wsClient.lastError?.message || "RAY upstream connect failed";
    }
  }

  _transmit(payload) {
    if (!this.agServer) return;
    this.stats.messagesRelayed += 1;
    this.stats.lastUpstreamAt = Date.now();
    try {
      this.agServer.exchange.transmitPublish("match", payload);
    } catch (err) {
      this.stats.lastError = err.message;
    }
  }

  async stop() {
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.stats.upstreamConnected = false;
    if (this.agServer) {
      this.agServer.close();
      this.agServer = null;
    }
  }

  getStatus() {
    if (this.wsClient) {
      this.stats.upstreamConnected = this.wsClient.connected;
    }
    this.stats.downstreamClients = this._countSockets();
    return { ...this.stats };
  }
}

module.exports = { RayScRelay, WS_PATH };
