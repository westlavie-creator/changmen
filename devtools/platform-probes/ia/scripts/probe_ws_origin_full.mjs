/**
 * 完整 Socket.IO 流程（polling → websocket），对比仅 websocket。
 * Node 可设 Origin；对比 A8 / localhost / ilustre。
 */
import { backendRequire } from "../../backend/_paths.js";

const { io } = backendRequire("socket.io-client");

const WS_BASE = "wss://47.115.75.57";
const PATH = "/esport/ws/IA";
const GATEWAY = "https://ilustre-analytics.org";

const ORIGINS = [
  { label: "api.a8.to", origin: "https://api.a8.to" },
  { label: "localhost:5275", origin: "http://localhost:5275" },
  { label: "ilustre", origin: "https://ilustre-analytics.org" },
];

const TRANSPORTS = [
  { name: "websocket-only", transports: ["websocket"] },
  { name: "polling+websocket", transports: ["polling", "websocket"] },
];

function tryConnect({ label, origin, transports }) {
  return new Promise((resolve) => {
    const extraHeaders = { token: "hello" };
    if (origin) extraHeaders.Origin = origin;

    const socket = io(WS_BASE, {
      transports,
      withCredentials: true,
      path: PATH,
      extraHeaders,
      auth: { token: GATEWAY },
      reconnection: false,
      timeout: 10000,
    });

    const done = (ok, error) => {
      socket.removeAllListeners();
      socket.disconnect();
      resolve({ ok, error });
    };

    socket.on("connect", () => done(true, null));
    socket.on("connect_error", (err) => done(false, err.message));
    setTimeout(() => done(false, "timeout 10s"), 10000);
  });
}

console.log(`Socket.IO full probe → ${WS_BASE}${PATH}\n`);

for (const t of TRANSPORTS) {
  console.log(`--- transports: ${t.name} ---`);
  for (const o of ORIGINS) {
    const r = await tryConnect({
      label: o.label,
      origin: o.origin,
      transports: t.transports,
    });
    console.log(
      `  [${o.label}] Origin=${o.origin} → ${r.ok ? "OK connect" : `FAIL ${r.error}`}`,
    );
  }
  console.log();
}
