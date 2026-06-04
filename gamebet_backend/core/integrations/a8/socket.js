"use strict";

const { io } = require("socket.io-client");

const DEFAULT_URL = "http://127.0.0.1:3456";

/**
 * A8 公共 Socket.IO 聚合层（IM / XBet / Stake 等频道）。
 */
class A8SocketClient {
  constructor(options = {}) {
    this.url = options.url || process.env.A8_WS_URL || process.env.A8_SOCKET_URL || DEFAULT_URL;
    this.token = options.token || process.env.A8_SOCKET_TOKEN || "";
    this.origin = options.origin || process.env.A8_SOCKET_ORIGIN || "https://api.a8.to";
    this.socket = null;
    this.connected = false;
    this._handlers = new Map();
    this._running = false;
    this.lastError = null;
  }

  onChannel(channel, fn) {
    this._handlers.set(channel, fn);
    return () => this._handlers.delete(channel);
  }

  connect(rooms = []) {
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

      this.socket = io(this.url, {
        transports: ["websocket"],
        withCredentials: true,
        extraHeaders: {
          Origin: this.origin,
          token: this.token || "hello",
        },
      });

      this.socket.on("connect", () => {
        this.lastError = null;
        for (const room of rooms) {
          this.socket.emit("join room", room);
        }
        finish(true);
      });

      this.socket.on("chat message", (raw) => {
        try {
          const packet = typeof raw === "string" ? JSON.parse(raw) : raw;
          const channel = packet?.channel;
          const handler = channel ? this._handlers.get(channel) : null;
          if (handler) handler(packet.message ?? packet);
        } catch (err) {
          this.lastError = err.message;
        }
      });

      this.socket.on("connect_error", (err) => {
        this.lastError = err.message;
        finish(false);
      });

      setTimeout(() => {
        if (!settled) finish(this.connected);
      }, 10000);
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

module.exports = { A8SocketClient, DEFAULT_A8_WS_URL: DEFAULT_URL };
