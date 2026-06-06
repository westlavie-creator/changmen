"use strict";

/**
 * IaRelayCore — IA Socket.IO 上游连接（供 Electron IPC relay 使用）
 *
 * 与 ia_ws_relay.js 的区别：
 *   - ia_ws_relay：透明 WS 隧道（每个浏览器客户端一条上游，Web 模式）
 *   - IaRelayCore：主进程直接用 socket.io-client 连上游，注入 Origin/token header，
 *     roomMessageCallBack 事件经 IPC 广播给 renderer（Electron 模式）
 *
 * socket.io-client 在 Node.js 环境下支持 extraHeaders，浏览器侧无此能力，
 * 这是透明隧道存在的原因；主进程替代隧道后两者功能等价。
 */

const socketio = require("socket.io-client");

const DEFAULT_UPSTREAM = process.env.IA_WS_URL || "https://47.115.75.57";
const DEFAULT_GATEWAY  = "https://ilustre-analytics.org";

class IaRelayCore {
  constructor() {
    this._socket   = null;
    this._gateway  = null;
    this._stopped  = false;
    this._handlers = new Set();
    this.stats = {
      platform: "IA",
      upstreamConnected: false,
      messagesReceived: 0,
      lastError: null,
      lastUpstreamAt: null,
    };
  }

  /** 注册 roomMessageCallBack 回调，返回解除函数 */
  onMessage(fn) {
    this._handlers.add(fn);
    return () => this._handlers.delete(fn);
  }

  /** gateway 用于注入 Origin header；留空则用默认值 */
  start(gateway) {
    this._stopped = false;
    if (gateway) this._gateway = gateway;
    this._connect();
    return this.getStatus();
  }

  stop() {
    this._stopped = true;
    this._closeSocket();
    return this.getStatus();
  }

  getStatus() {
    this.stats.upstreamConnected = Boolean(this._socket?.connected);
    return { ...this.stats };
  }

  _closeSocket() {
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket.disconnect();
      this._socket = null;
    }
    this.stats.upstreamConnected = false;
  }

  _connect() {
    if (this._stopped) return;
    if (this._socket?.connected) return;

    this._closeSocket();

    const origin = (this._gateway || DEFAULT_GATEWAY).replace(/\/+$/, "");

    const socket = socketio(DEFAULT_UPSTREAM, {
      transports: ["websocket"],
      path: "/esport/ws/IA",
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 8000,
      extraHeaders: {
        Origin: origin,
        token: "hello",        // A8 relay 固定值，与 ia_ws_relay.js 一致
      },
      rejectUnauthorized: false,
    });

    socket.on("connect", () => {
      this.stats.upstreamConnected = true;
      this.stats.lastError = null;
      console.log(`[IA relay] upstream connected → ${DEFAULT_UPSTREAM}/esport/ws/IA  origin=${origin}`);
      socket.emit("RoomJoin", { room_type: "room_type_index_content_push" });
    });

    socket.on("roomMessageCallBack", (msg) => {
      this.stats.messagesReceived += 1;
      this.stats.lastUpstreamAt = Date.now();
      for (const fn of this._handlers) {
        try { fn(msg); } catch { /* ignore handler errors */ }
      }
    });

    socket.on("disconnect", (reason) => {
      this.stats.upstreamConnected = false;
      console.log("[IA relay] upstream disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      this.stats.lastError = err.message;
      console.warn("[IA relay] connect error:", err.message);
    });

    this._socket = socket;
  }
}

module.exports = { IaRelayCore };
