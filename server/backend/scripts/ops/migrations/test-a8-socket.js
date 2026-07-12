// 测试 A8 Socket.IO 服务器连接 + IM/XBet 数据接收
// 用法: node scripts/test-a8-socket.js [token]

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { io } = require("socket.io-client");

const URL = "https://47.115.75.57";
const TOKEN = process.argv[2] || "";
const ROOMS = ["IM", "XBet", "XBet:Score", "Stake"];
const TIMEOUT_MS = 15_000;

console.log(`[test] 连接 ${URL} ...`);
const socket = io(URL, {
  transports: ["websocket"],
  withCredentials: true,
  extraHeaders: {
    Origin: "https://api.a8.to",
    token: TOKEN,
  },
  rejectUnauthorized: false,
});

const received = {};

socket.on("connect", () => {
  console.log(`[test] ✅ 已连接，socket.id=${socket.id}`);
  for (const room of ROOMS) {
    socket.emit("join room", room);
    console.log(`[test] join room → ${room}`);
  }
});

socket.on("connect_error", (err) => {
  console.error(`[test] ❌ 连接失败: ${err.message}`);
});

socket.on("chat message", (raw) => {
  try {
    const pkt = typeof raw === "string" ? JSON.parse(raw) : raw;
    const ch = pkt?.channel || "?";
    if (!received[ch]) {
      received[ch] = 0;
      console.log(`[test] 📨 首条消息 channel=${ch}`);
    }
    received[ch]++;
    if (received[ch] <= 2) {
      const preview = JSON.stringify(pkt).slice(0, 200);
      console.log(`[test]   内容预览: ${preview}`);
    }
  }
  catch {
    console.log(`[test] 📨 raw message (non-JSON): ${String(raw).slice(0, 100)}`);
  }
});

socket.onAny((event, ...args) => {
  if (event !== "chat message") {
    console.log(`[test] 收到事件 "${event}":`, String(args[0] || "").slice(0, 100));
  }
});

setTimeout(() => {
  console.log("\n[test] ⏱ 超时结束");
  console.log("[test] 各频道收到消息数:", received);
  const total = Object.values(received).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.log(`[test] ✅ 共收到 ${total} 条消息`);
  }
  else {
    console.log("[test] ⚠️  未收到任何消息");
  }
  socket.disconnect();
  process.exit(0);
}, TIMEOUT_MS);
