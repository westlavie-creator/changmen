import { DEFAULT_A8_WS } from "../config.js";

/** 对齐 A8 content `xn`：经 Socket.IO 向 A8 频道推送 Stake 赔率增量 */
export function createA8Bridge(channel) {
  const ioFn = globalThis.io;
  if (typeof ioFn !== "function") {
    console.warn("[Stake] socket.io 未加载，实时频道不可用");
    return { send() {} };
  }

  const socket = ioFn(DEFAULT_A8_WS, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20_000,
  });

  socket.on("connect", () => {
    console.log("✅ 已连接到 A8 Socket", {
      socketId: socket.id,
      connected: socket.connected,
    });
  });

  return {
    send(message) {
      if (socket.connected) {
        socket.emit("chat message", JSON.stringify({ channel, message }));
      }
    },
  };
}
