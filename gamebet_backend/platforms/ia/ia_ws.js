"use strict";

const { io } = require("socket.io-client");

const DEFAULT_A8_WS = "wss://47.115.75.57";

/**
 * IA 实时 Socket.IO（A8 模式：/esport/ws/IA 房间推送）。
 */
class IaWsClient {
  constructor(options = {}) {
    this.wsBase = options.wsBase || process.env.IA_WS_URL || process.env.A8_WS_URL || DEFAULT_A8_WS;
    this.gateway = options.gateway || process.env.IA_GATEWAY || "https://ilustre-analytics.org";
    this.reconnectMinMs = options.reconnectMinMs || 2000;
    this.reconnectMaxMs = options.reconnectMaxMs || 8000;
    this.socket = null;
    this.connected = false;
    this._running = false;
    this._onMessage = null;
    this.lastError = null;
  }

  onMessage(fn) {
    this._onMessage = fn;
  }

  connect() {
    if (this._running && this.connected) return Promise.resolve(true);
    this._running = true;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        this.connected = ok;
        resolve(ok);
      };

      const origin = this.gateway.replace(/\/+$/, "");
      this.socket = io(this.wsBase, {
        transports: ["websocket"],
        withCredentials: true,
        path: "/esport/ws/IA",
        extraHeaders: {
          Origin: origin,
          token: "hello",
        },
        auth: {
          token: origin,
        },
        reconnection: true,
        reconnectionDelay: this.reconnectMinMs,
        reconnectionDelayMax: this.reconnectMaxMs,
      });

      this.socket.on("connect", () => {
        this.lastError = null;
        this.socket.emit("RoomJoin", { room_type: "room_type_index_content_push" });
        finish(true);
      });

      this.socket.on("roomMessageCallBack", (msg) => {
        if (this._onMessage) this._onMessage(msg);
      });

      this.socket.on("connect_error", (err) => {
        this.lastError = err.message;
        finish(false);
      });

      setTimeout(() => {
        if (!settled) finish(this.connected);
      }, 8000);
    });
  }

  disconnect() {
    this._running = false;
    this.connected = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

module.exports = { IaWsClient };
