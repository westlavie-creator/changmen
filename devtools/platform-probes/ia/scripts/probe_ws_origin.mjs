/**
 * Node 可自定义 WebSocket 握手 Origin（浏览器里 extraHeaders 对纯 websocket 无效）。
 * 用于验证 47.115.75.57 IA WS 是否按 Origin 白名单放行。
 */
import { backendRequire } from "../../backend/_paths.js";

const { io } = backendRequire("socket.io-client");

const WS_BASE = "wss://47.115.75.57";
const PATH = "/esport/ws/IA";
const GATEWAY = "https://ilustre-analytics.org";

const CASES = [
  { label: "A8 线上页面", origin: "https://api.a8.to" },
  { label: "changmen localhost", origin: "http://localhost:5275" },
  { label: "bundle extraHeaders", origin: "https://ilustre-analytics.org" },
  { label: "无 Origin 头", origin: null },
];

function probeOne({ label, origin }) {
  return new Promise((resolve) => {
    const extraHeaders = { token: "hello" };
    if (origin) extraHeaders.Origin = origin;

    const socket = io(WS_BASE, {
      transports: ["websocket"],
      withCredentials: true,
      path: PATH,
      extraHeaders,
      auth: { token: GATEWAY },
      reconnection: false,
      timeout: 8000,
    });

    const done = (result) => {
      socket.removeAllListeners();
      socket.disconnect();
      resolve({ label, origin: origin ?? "(none)", ...result });
    };

    socket.on("connect", () => done({ ok: true, error: null }));
    socket.on("connect_error", (err) => done({ ok: false, error: err.message }));
    setTimeout(() => done({ ok: false, error: "timeout 8s" }), 8000);
  });
}

console.log(`IA WS probe → ${WS_BASE}${PATH}\n`);

for (const c of CASES) {
  const r = await probeOne(c);
  const status = r.ok ? "OK connect" : `FAIL ${r.error}`;
  console.log(`[${r.label}] Origin=${r.origin} → ${status}`);
}
