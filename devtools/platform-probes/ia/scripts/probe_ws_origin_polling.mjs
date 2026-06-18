/**
 * Socket.IO polling 握手（Node 可设 Origin），看 HTTP 状态与 body 片段。
 */
const WS_HOST = "https://47.115.75.57";
const PATH = "/esport/ws/IA/";
const GATEWAY = "https://ilustre-analytics.org";

const CASES = [
  { label: "A8 线上页面", origin: "https://api.a8.to" },
  { label: "changmen localhost", origin: "http://localhost:5275" },
  { label: "ilustre-analytics", origin: "https://ilustre-analytics.org" },
];

async function probePolling({ label, origin }) {
  const url = `${WS_HOST}${PATH}?EIO=4&transport=polling`;
  const headers = {
    token: "hello",
    Accept: "*/*",
  };
  if (origin) headers.Origin = origin;

  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    const text = await res.text();
    return {
      label,
      origin,
      status: res.status,
      body: text.slice(0, 160).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { label, origin, status: "ERR", body: e instanceof Error ? e.message : String(e) };
  }
}

console.log(`Polling probe ${WS_HOST}${PATH}\n`);
for (const c of CASES) {
  const r = await probePolling(c);
  console.log(`[${r.label}] Origin=${r.origin}`);
  console.log(`  HTTP ${r.status}  body=${r.body}\n`);
}
