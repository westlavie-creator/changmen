"use strict";

const WebSocket = require("ws");
const { buildTfUpstreamUrl } = require("../../host/web/proxy/tf_ws_relay.js");
const { stripTokenPrefix } = require("./tf_auth.js");

const WS_HOSTS = ["api.a8.to", "47.115.75.57"];
let hostRotate = 0;

function buildA8StyleWsUrl(token) {
  const auth = stripTokenPrefix(token);
  const host = WS_HOSTS[hostRotate % WS_HOSTS.length];
  hostRotate += 1;
  return `wss://${host}/esport/ws/TF?auth_token=${encodeURIComponent(auth)}&combo=false`;
}

/**
 * TF 实时 WebSocket（A8 模式：优先直连 TF ws，可选 A8 代理 host）。
 */
class TfWsClient {
  constructor(options = {}) {
    this.gateway = options.gateway || process.env.TF_GATEWAY || "";
    this.token = options.token || process.env.TF_TOKEN || "";
    this.useA8Proxy = options.useA8Proxy ?? process.env.TF_WS_A8 === "1";
    this.wsUrlOverride = options.wsUrl || process.env.TF_WS_URL || "";
    this.reconnectMinMs = options.reconnectMinMs || 1000;
    this.reconnectMaxMs = options.reconnectMaxMs || 5000;
    this.ws = null;
    this.connected = false;
    this._running = false;
    this._onOdds = null;
    this.lastError = null;
    this._reconnectTimer = null;
  }

  resolveWsUrl() {
    if (this.wsUrlOverride) return this.wsUrlOverride;
    if (this.useA8Proxy) return buildA8StyleWsUrl(this.token);
    return buildTfUpstreamUrl(this.gateway, this.token, false);
  }

  onOdds(fn) {
    this._onOdds = fn;
  }

  connect() {
    if (this._running) return Promise.resolve(this.connected);
    if (!this.gateway || !this.token) {
      this.lastError = "TF WS: missing gateway/token";
      return Promise.resolve(false);
    }

    this._running = true;
    return new Promise((resolve) => {
      const url = this.resolveWsUrl();
      this.ws = new WebSocket(url);

      const finish = (ok) => {
        this.connected = ok;
        resolve(ok);
      };

      this.ws.on("open", () => {
        this.lastError = null;
        finish(true);
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(String(data));
          if (this._onOdds) this._onOdds(msg);
        } catch {
          /* ignore non-json */
        }
      });

      this.ws.on("error", (err) => {
        this.lastError = err.message;
        if (!this.connected) finish(false);
      });

      this.ws.on("close", () => {
        this.connected = false;
        if (this._running) this.scheduleReconnect();
      });
    });
  }

  scheduleReconnect() {
    if (this._reconnectTimer) return;
    const delay = Math.min(this.reconnectMaxMs, this.reconnectMinMs + Math.random() * 2000);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._running) return;
      this.connect().catch(() => {});
    }, delay);
  }

  disconnect() {
    this._running = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = { TfWsClient, buildA8StyleWsUrl };
