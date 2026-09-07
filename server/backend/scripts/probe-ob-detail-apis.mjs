import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const session = JSON.parse(fs.readFileSync(path.join(root, "storage/sport/ob_session.json"), "utf8"));
const token = session.token;
const cuid = String(session.sessionId).replace(/\D/g, "").slice(0, 18);
const euid = "3020101";
const gw = String(session.gateway || "https://api.jpbfa750.com").replace(/\/$/, "");

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
  let parsed;
  try {
    parsed = JSON.parse(await r.text());
  }
  catch {
    return { apiPath, status: r.status, code: "nonjson" };
  }
  let decoded = parsed.data;
  if (typeof decoded === "string") {
    try { decoded = decode(decoded); }
    catch { decoded = { decodeErr: true }; }
  }
  const pd = decoded?.playData;
  const data0 = Array.isArray(decoded?.data) ? decoded.data[0] : null;
  return {
    apiPath,
    bodyKeys: Object.keys(body),
    extra: body.hpid || body.hps || body.mcid,
    code: parsed.code,
    msg: parsed.msg,
    topKeys: decoded && typeof decoded === "object" ? Object.keys(decoded).slice(0, 20) : [],
    playN: Array.isArray(pd) ? pd.length : 0,
    hpids: Array.isArray(pd) ? [...new Set(pd.map(p => p.hpid))] : [],
    names: Array.isArray(pd) ? [...new Set(pd.map(p => p.hpn || p.title))].slice(0, 30) : [],
    dataHps: data0 ? Object.keys(data0).filter(k => /^hps/i.test(k)) : [],
    pns: (data0?.hpsPns || []).slice(0, 8).map(p => `${p.hpid}:${p.hpn}`),
    pnsN: data0?.hpsPns?.length,
  };
}

const mid = process.argv[2] || "5618862";
const probes = [
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 0, euid, mid, mcid: 0, newUser: 0 }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 1, orpt: 0, euid, mid, mcid: 0, newUser: 0 }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 1, euid, mid, mcid: 0, newUser: 0 }],
  ["/yewu11/v1/w/getMatchBaseInfoByOddsPB", { cuid, euid, mid }],
  ["/yewu11/v1/w/getMatchOddsInfoPB", { cuid, euid, mid }],
  ["/yewu11/v1/w/getMatchDetailPB", { cuid, euid, mid }],
  ["/yewu11/v1/w/getOddsFromPlayPB", { cuid, euid, mid }],
  ["/yewu11/v1/w/category/getMatchOddsPB", { cuid, euid, mid }],
  ["/yewu11/v1/w/findPlaySortPB", { cuid, euid, mid, csid: 1 }],
  ["/yewu11/v1/w/findPlayTopPB", { cuid, euid, mid, csid: "1" }],
  ["/yewu11/v2/w/getMatchBaseInfoByOddsPB", { cuid, cos: 0, orpt: 0, euid, mid, mcid: 0, newUser: 0 }],
];

for (const [apiPath, body] of probes) {
  try {
    console.log(JSON.stringify(await post(apiPath, body)));
  }
  catch (e) {
    console.log(JSON.stringify({ apiPath, err: String(e.message || e) }));
  }
}
