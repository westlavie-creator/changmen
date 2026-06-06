"use strict";

/**
 * TfRelayCore — TF WS 上游连接（供 Electron IPC relay 使用）
 *
 * 与 tf_ws_relay.js 的区别：
 *   - tf_ws_relay：每个浏览器客户端一条上游连接（Web 模式）
 *   - TfRelayCore：一条共享上游连接，消息经 IPC 广播给 renderer（Electron 模式）
 */

const WebSocket = require("ws");

// [A8 可证实] bundle WBe: wss://${["api.a8.to","47.115.75.57"][jF%2]}/esport/ws/TF?auth_token=...
// TF WS 走 A8 代理，不直连 TF 自己的 gateway。
// 47.115.75.57 与 api.a8.to 是同一 A8 代理的 IP/域名两种写法；
// 固定用 IP，避免 DNS 解析延迟或域名不可达导致每隔一次重连失败。
const TF_UPSTREAM_HOST = "47.115.75.57";

function buildTfUpstreamUrl(_gateway, token) {
  const auth = String(token || "").replace(/^Token\s+/i, "");
  return `wss://${TF_UPSTREAM_HOST}/esport/ws/TF?auth_token=${encodeURIComponent(auth)}&combo=false`;
}

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 5_000;
const RECONNECT_GROW   = 1.3;

class TfRelayCore {
  constructor() {
    this._upstream   = null;
    this._token      = null;
    this._gateway    = null;
    this._stopped    = false;
    this._retryMs    = RECONNECT_MIN_MS;
    this._retryTimer = null;
    this._handlers   = new Set();
    this.stats = {
      platform: "TF",
      upstreamConnected: false,
      messagesReceived: 0,
      lastError: null,
      lastUpstreamAt: null,
    };
  }

  /** 注册消息回调，返回解除函数 */
  onMessage(fn) {
    this._handlers.add(fn);
    return () => this._handlers.delete(fn);
  }

  /** token: "Token xxxxx"，gateway: 采集平台 gateway */
  start(token, gateway) {
    this._stopped = false;
    if (token)   this._token   = token;
    if (gateway) this._gateway = gateway;
    this._connect();
    return this.getStatus();
  }

  stop() {
    this._stopped = true;
    this._clearRetry();
    this._closeUpstream();
    return this.getStatus();
  }

  getStatus() {
    this.stats.upstreamConnected = Boolean(
      this._upstream && this._upstream.readyState === WebSocket.OPEN,
    );
    return { ...this.stats };
  }

  /** 上游是否正在连接中（CONNECTING 或 OPEN），用于防止竞态重复启动 */
  isUpstreamActive() {
    if (!this._upstream) return false;
    const s = this._upstream.readyState;
    return s === WebSocket.CONNECTING || s === WebSocket.OPEN;
  }

  _clearRetry() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this._stopped) return;
    this._clearRetry();
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this._connect();
    }, this._retryMs);
    this._retryMs = Math.min(Math.floor(this._retryMs * RECONNECT_GROW), RECONNECT_MAX_MS);
  }

  _closeUpstream() {
    if (this._upstream) {
      this._upstream.removeAllListeners();
      // 防止孤儿 WS 的 pending 错误成为 uncaught exception
      this._upstream.on("error", () => {});
      try { this._upstream.close(); } catch { /* ignore */ }
      this._upstream = null;
    }
    this.stats.upstreamConnected = false;
  }

  _connect() {
    if (this._stopped) return;
    if (this._upstream && this._upstream.readyState === WebSocket.OPEN) return;

    if (!this._token) {
      this.stats.lastError = "no token";
      return;
    }

    this._closeUpstream();

    let url;
    try {
      url = buildTfUpstreamUrl(this._gateway || "", this._token, false);
    } catch (err) {
      this.stats.lastError = err.message;
      console.warn("[TF relay] buildUpstreamUrl error:", err.message);
      this._scheduleReconnect();
      return;
    }

    const ws = new WebSocket(url);

    ws.on("open", () => {
      this._retryMs = RECONNECT_MIN_MS;
      this.stats.upstreamConnected = true;
      this.stats.lastError = null;
      console.log(`[TF relay] upstream connected → ${url.replace(/auth_token=([^&]{0,8})[^&]*/,"auth_token=$1…")}`);
    });

    ws.on("message", (data) => {
      this.stats.messagesReceived += 1;
      this.stats.lastUpstreamAt = Date.now();
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      for (const fn of this._handlers) {
        try { fn(text); } catch { /* ignore handler errors */ }
      }
    });

    ws.on("error", (err) => {
      this.stats.lastError = err.message;
      this.stats.upstreamConnected = false;
      console.warn("[TF relay] upstream error:", err.message);
    });

    ws.on("close", () => {
      this.stats.upstreamConnected = false;
      this._upstream = null;
      if (!this._stopped) {
        console.log("[TF relay] upstream closed, reconnecting...");
        this._scheduleReconnect();
      }
    });

    this._upstream = ws;
  }
}

module.exports = { TfRelayCore, buildTfUpstreamUrl };
