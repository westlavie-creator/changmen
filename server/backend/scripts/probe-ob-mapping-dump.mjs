import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const session = JSON.parse(fs.readFileSync(path.join(root, "storage/sport/ob_session.json"), "utf8"));
const token = session.token;
const cuid = String(session.sessionId).replace(/\D/g, "").slice(0, 18);
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

const url = `${gw}/yewu11/v3/menu/loadMappingPB?t=${Date.now()}`;
const r = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify({ cuid }) });
const parsed = JSON.parse(await r.text());
const decoded = typeof parsed.data === "string" ? decode(parsed.data) : parsed.data;
const sample = {};
for (const k of Object.keys(decoded || {}).slice(0, 8)) {
  const v = decoded[k];
  sample[k] = Array.isArray(v)
    ? { n: v.length, item: v[0] && (typeof v[0] === "object" ? Object.keys(v[0]) : v[0]) }
    : (v && typeof v === "object" ? Object.keys(v).slice(0, 12) : v);
}
console.log(JSON.stringify({ keys: Object.keys(decoded || {}), sample, k401: decoded?.["401"]?.slice?.(0, 3) || decoded?.["401"] }, null, 2).slice(0, 6000));
