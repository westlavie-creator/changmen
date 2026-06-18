/** 尽量贴近 A8 浏览器截图里的请求头 */
import WebSocket from "ws";

const URL =
  "wss://47.115.75.57/esport/ws/IA/?EIO=4&transport=websocket";

const CASES = [
  {
    label: "仿 A8 Chrome",
    headers: {
      Origin: "https://api.a8.to",
      token: "hello",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
  },
  {
    label: "仿 localhost Chrome",
    headers: {
      Origin: "http://localhost:5275",
      token: "hello",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
  },
];

function probe({ label, headers }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL, { headers, handshakeTimeout: 12000 });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      try {
        ws.terminate();
      } catch {
        /* */
      }
      resolve({ label, ...r });
    };
    ws.on("open", () => finish({ ok: true, status: 101 }));
    ws.on("unexpected-response", (_r, res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        finish({
          ok: false,
          status: res.statusCode,
          detail: Buffer.concat(chunks).toString("utf8").slice(0, 80),
        }),
      );
    });
    ws.on("error", (e) => finish({ ok: false, status: "ERR", detail: e.message }));
    setTimeout(() => finish({ ok: false, status: "TIMEOUT", detail: "" }), 12000);
  });
}

for (const c of CASES) {
  const r = await probe(c);
  console.log(
    `[${r.label}] → ${r.ok ? "OK 101" : `FAIL ${r.status} ${r.detail}`}`,
  );
}
