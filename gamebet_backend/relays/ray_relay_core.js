"use strict";

const { RayWsClient } = require("../platforms/ray/ray_ws.js");
const { login } = require("../platforms/ray/ray_session.js");

function defaultSyncRayFromSession(session) {
  const { syncRayFromSession } = require("../core/esport-api/platform_sync.js");
  return syncRayFromSession(session);
}

class RayRelayCore {
  constructor(options = {}, deps = {}) {
    this.options = options;
    this.login = deps.login || login;
    this.syncRayFromSession = deps.syncRayFromSession || defaultSyncRayFromSession;
    this.clientFactory = deps.clientFactory || ((clientOptions) => new RayWsClient(clientOptions));
    this.wsClient = null;
    this.handlers = new Set();
    this.stats = {
      platform: "RAY",
      upstreamConnected: false,
      messagesReceived: 0,
      lastError: null,
      lastUpstreamAt: null,
    };
  }

  onMessage(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  async start() {
    let session = null;
    try {
      session = await this.login(this.options);
      this.syncRayFromSession(session);
    } catch (err) {
      this.stats.lastError = err.message;
    }

    const token = session?.token || this.options.token;
    const origin = session?.origin || this.options.origin;

    this.wsClient = this.clientFactory({
      hostname: this.options.hostname,
      path: this.options.path,
      channel: this.options.channel,
      token,
      origin,
    });

    this.wsClient.onOdds((odds, envelope) => {
      this._emit(envelope || { source: "odds", odds });
    });

    this.wsClient.onMatch((match, envelope) => {
      this._emit(envelope || { source: "match", match });
    });

    const ok = await this.wsClient.connect();
    this.stats.upstreamConnected = Boolean(ok);
    if (ok) {
      const { hostname, path, channel, token } = this.wsClient;
      console.log(`[RAY relay] upstream connected → wss://${hostname}${path}  channel=${channel}  token=${String(token).slice(0,8)}…`);
    } else {
      this.stats.lastError = this.wsClient.lastError?.message || "RAY upstream connect failed";
    }
    return ok;
  }

  _emit(payload) {
    this.stats.messagesReceived += 1;
    this.stats.lastUpstreamAt = Date.now();
    for (const fn of this.handlers) {
      try {
        fn(payload);
      } catch (err) {
        this.stats.lastError = err.message;
      }
    }
  }

  async stop() {
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.stats.upstreamConnected = false;
  }

  getStatus() {
    if (this.wsClient) {
      this.stats.upstreamConnected = this.wsClient.connected;
    }
    return { ...this.stats };
  }
}

module.exports = { RayRelayCore };
