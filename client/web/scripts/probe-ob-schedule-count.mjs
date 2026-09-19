/** Count OB football mids from tryPlay + schedule. */
import zlib from "zlib";

function uuidNoDash() {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const tr = await fetch("https://api.dbsporxxxw1box.com/yewu6/user/tryPlay?lang=en&terminal=PC", {
  headers: { Accept: "application/json, text/plain, */*" },
  signal: AbortSignal.timeout(25000),
});
const tj = await tr.json();
const token = String(tj?.data?.token || "");
const ts = Date.now();
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  lang: "en",
  requestId: token,
  checkId: `pc-${uuidNoDash()}--${ts}`,
  "request-code": "{\"panda-bss-source\":\"2\"}",
};

async function sched(euid, type) {
  const url = `https://api.dbsporxxxw1box.com/yewu11/v1/w/structureTournamentMatchesPB?t=${Date.now()}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ cuid: "", sort: 1, type, device: "v2_h5", euid }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  if (String(j.code) !== "0000000")
    return { euid, code: j.code, msg: j.msg, mids: 0 };
  const raw = zlib.gunzipSync(Buffer.from(String(j.data), "base64")).toString("utf8");
  const data = JSON.parse(raw);
  const mids = new Set();
  const starts = [];
  const walk = (o) => {
    if (!o || typeof o !== "object")
      return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (o.mids)
      String(o.mids).split(/[,\s]+/).filter(Boolean).forEach((m) => mids.add(m));
    if (o.mid)
      mids.add(String(o.mid));
    const st = Number(o.mgt || o.mgtc || o.startTime || 0);
    if (st > 0)
      starts.push(st > 1e12 ? st : st * 1000);
    for (const v of Object.values(o))
      walk(v);
  };
  walk(data);
  const now = Date.now();
  const in2h = starts.filter((t) => t >= now - 4 * 3600e3 && t <= now + 2 * 3600e3).length;
  return { euid, code: j.code, mids: mids.size, startSamples: starts.length, inWindowApprox: in2h };
}

console.log(JSON.stringify({ tokenOk: token.length > 0, today: await sched("3020101", 3), live: await sched("30002", 1) }, null, 2));
