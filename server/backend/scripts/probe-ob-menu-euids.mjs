import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const session = JSON.parse(fs.readFileSync(path.join(root, "storage/sport/ob_session.json"), "utf8"));
const token = session.token;
const cuid = String(session.sessionId).replace(/\D/g, "").slice(0, 18);
const gw = String(session.gateway || "https://api.jpbfa750.com").replace(/\/$/, "");
const mid = process.argv[2] || "5618862";

function headers() {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    lang: "zh",
    requestId: token,
    checkId: `pc-${uuid}-${cuid}-${Date.now()}`,
    "request-code": JSON.stringify({ "panda-bss-source": "2" }),
    Referer: session.referer,
    Origin: new URL(session.referer).origin,
  };
}

function decode(data) {
  const buf = Buffer.from(String(data).replace(/\s/g, ""), "base64");
  const json = buf[0] === 0x1f && buf[1] === 0x8b
    ? zlib.gunzipSync(buf).toString("utf8")
    : buf.toString("utf8");
  return JSON.parse(json);
}

async function post(apiPath, body) {
  const url = `${gw}${apiPath}?t=${Date.now()}`;
  const r = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { apiPath, status: r.status, nonjson: text.slice(0, 80) }; }
  let decoded = parsed.data;
  if (typeof decoded === "string") {
    try { decoded = decode(decoded); }
    catch { decoded = null; }
  }
  const pd = decoded?.playData;
  const euids = [];
  const walk = (o, d = 0) => {
    if (!o || typeof o !== "object" || d > 6) return;
    if (o.euid != null) euids.push(String(o.euid) + (o.name || o.n || o.menuName || ""));
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.slice(0, 40).forEach(x => walk(x, d + 1));
      else walk(v, d + 1);
    }
  };
  walk(decoded);
  return {
    apiPath,
    code: parsed.code,
    msg: parsed.msg,
    keys: decoded && typeof decoded === "object" ? Object.keys(decoded).slice(0, 16) : [],
    playN: Array.isArray(pd) ? pd.length : 0,
    names: Array.isArray(pd) ? [...new Set(pd.map(p => p.hpn || p.title))].slice(0, 25) : [],
    euids: [...new Set(euids)].slice(0, 40),
    arrLens: decoded && typeof decoded === "object"
      ? Object.fromEntries(Object.entries(decoded).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]))
      : {},
  };
}

const bodies = [
  ["/yewu11/v3/menu/loadMappingPB", { cuid }],
  ["/yewu11/v3/menu/loadMappingPB", { cuid, euid: "3020101" }],
  ["/yewu11/v1/w/findPlaySortPB", { cuid, mid, csid: "1" }],
  ["/yewu11/v1/w/findPlaySortPB", { cuid, mid, euid: "3020101" }],
  ["/yewu11/v1/w/category/findPlayTopPB", { cuid, mid, csid: "1" }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 0, euid: "1", mid, mcid: 0, newUser: 0 }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 0, euid: "20003", mid, mcid: 0, newUser: 0 }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 0, euid: "30201011", mid, mcid: 0, newUser: 0 }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 0, euid: "3020101", mid, mcid: 1, newUser: 0 }],
];

for (const [p, b] of bodies) {
  try { console.log(JSON.stringify(await post(p, b))); }
  catch (e) { console.log(JSON.stringify({ p, err: String(e.message || e) })); }
}
