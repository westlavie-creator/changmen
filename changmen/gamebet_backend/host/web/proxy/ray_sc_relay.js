"use strict";

const { AGServer } = require("socketcluster-server");
const { requirePlatformRelay } = require("../../../core/shared/adapter_paths.js");
const { RayRelayCore } = requirePlatformRelay("RAY");

const WS_PATH = "/esport/ws/RAY";

class RayScRelay {
  constructor(options = {}) {
    this.options = options;
    this.agServer = null;
    this.core = null;
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
    this.core = new RayRelayCore(this.options);
    this.core.onMessage((payload) => this._transmit(payload));
    const ok = await this.core.start();
    this.stats.upstreamConnected = Boolean(ok);
    if (!ok) {
      this.stats.lastError = this.core.getStatus().lastError || "RAY upstream connect failed";
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
    if (this.core) {
      await this.core.stop();
      this.core = null;
    }
    this.stats.upstreamConnected = false;
    if (this.agServer) {
      this.agServer.close();
      this.agServer = null;
    }
  }

  getStatus() {
    if (this.core) {
      const coreStatus = this.core.getStatus();
      this.stats.upstreamConnected = coreStatus.upstreamConnected;
      this.stats.lastError = this.stats.lastError || coreStatus.lastError;
      this.stats.lastUpstreamAt = this.stats.lastUpstreamAt || coreStatus.lastUpstreamAt;
    }
    this.stats.downstreamClients = this._countSockets();
    return { ...this.stats };
  }
}

module.exports = { RayScRelay, WS_PATH };
