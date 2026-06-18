/**
 * Node ws 库直连 WebSocket upgrade，自定义 Origin，看 HTTP 响应码。
 */
import WebSocket from "ws";

const URL =
  "wss://47.115.75.57/esport/ws/IA/?EIO=4&transport=websocket";

const CASES = [
  { label: "A8 线上页面", origin: "https://api.a8.to" },
  { label: "changmen localhost", origin: "http://localhost:5275" },
  { label: "ilustre-analytics", origin: "https://ilustre-analytics.org" },
];

function probeWs({ label, origin }) {
  return new Promise((resolve) => {
    const headers = { token: "hello" };
    if (origin) headers.Origin = origin;

    const ws = new WebSocket(URL, { headers, handshakeTimeout: 10000 });
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      resolve({ label, origin, ...result });
    };

    ws.on("open", () => done({ ok: true, status: 101, detail: "open" }));
    ws.on("unexpected-response", (_req, res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").slice(0, 120);
        done({
          ok: false,
          status: res.statusCode,
          detail: body || res.statusMessage,
        });
      });
    });
    ws.on("error", (err) => done({ ok: false, status: "ERR", detail: err.message }));
    setTimeout(() => done({ ok: false, status: "TIMEOUT", detail: "10s" }), 10000);
  });
}

console.log(`Raw WS upgrade probe\n${URL}\n`);
for (const c of CASES) {
  const r = await probeWs(c);
  const line = r.ok ? "OK 101" : `FAIL HTTP ${r.status} ${r.detail}`;
  console.log(`[${r.label}] Origin=${c.origin} → ${line}`);
}
