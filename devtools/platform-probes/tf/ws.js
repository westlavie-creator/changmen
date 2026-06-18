import { backendRequire } from "../backend/_paths.js";
import { stripTokenPrefix } from "./auth.js";

const WebSocket = backendRequire("ws");

/** A8 `d4e` / `x5` [A8 可证实] */
export const TF_WS_HOSTS = ["api.a8.to", "47.115.75.57"];
export const TF_WS_PATH = "/esport/ws/TF";

let hostRotate = 0;

export function resetTfWsHostRotateForTests() {
  hostRotate = 0;
}

export function nextTfWsHost() {
  const host = TF_WS_HOSTS[hostRotate % TF_WS_HOSTS.length];
  hostRotate += 1;
  return host;
}

/** 对齐 changmen 浏览器 adapter `buildTfWsUrl` */
export function buildTfWsUrl(token, host = nextTfWsHost()) {
  const auth = stripTokenPrefix(token);
  return `wss://${host}${TF_WS_PATH}?auth_token=${auth}&combo=false`;
}

/** @deprecated 使用 buildTfWsUrl */
export function buildTfUpstreamUrl(_gateway, token) {
  return buildTfWsUrl(token, TF_WS_HOSTS[1]);
}

/** @deprecated 使用 buildTfWsUrl */
export function buildA8StyleWsUrl(token) {
  return buildTfWsUrl(token);
}


export class TfWsClient {
  constructor(options = {}) {
    this.gateway = options.gateway || process.env.TF_GATEWAY || "";
    this.token = options.token || process.env.TF_TOKEN || "";
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
    return buildTfWsUrl(this.token);
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
