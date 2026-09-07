/**
 * 对照一场 OB 列表/详情盘口数量（不写电竞）。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  extractObPlaySelections,
  listBetsFromObPlayData,
  playsFromObMatchRow,
} from "../core/esport-api/sport_ob_odds.js";

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
  const parsed = JSON.parse(await r.text());
  if (String(parsed.code) !== "0000000" && String(parsed.code) !== "0")
    return { code: parsed.code, msg: parsed.msg, decoded: null };
  const decoded = typeof parsed.data === "string" ? decode(parsed.data) : parsed.data;
  return { code: parsed.code, decoded };
}

function summarizePlay(p, label) {
  const rows = extractObPlaySelections(p);
  return {
    label,
    hpid: p?.hpid,
    hpn: p?.hpn || p?.title,
    hlType: Array.isArray(p?.hl) ? `arr${p.hl.length}` : typeof p?.hl,
    hpsN: Array.isArray(p?.hps) ? p.hps.length : 0,
    extracted: rows.length,
    withSel: rows.filter(x => x.selections.length).length,
  };
}

function collectHpsBags(row) {
  const out = [];
  for (const [k, v] of Object.entries(row || {})) {
    if (!/^hps/i.test(k) || k === "hpsPns")
      continue;
    out.push({ k, type: Array.isArray(v) ? `arr${v.length}` : typeof v });
  }
  return out;
}

const mid = process.argv[2] || "5450099";
const list = await post("/yewu11/v1/w/structureMatchBaseInfoByMidsPB", { cuid, euid, mids: mid });
const row = list.decoded?.data?.[0] || list.decoded?.[0];
const fromList = playsFromObMatchRow(row);
const listBets = listBetsFromObPlayData(fromList);
console.log("LIST", JSON.stringify({
  code: list.code,
  keysHps: collectHpsBags(row),
  playsFromRow: fromList.length,
  listBets: listBets.length,
  listBetNames: listBets.map(b => `${b.marketCode}:${b.line}`),
  hpsData0: row?.hpsData?.[0] ? {
    hpsN: row.hpsData[0].hps?.length,
    addN: row.hpsData[0].hpsAdd?.length,
    addHpids: (row.hpsData[0].hpsAdd || []).map(p => p.hpid),
    addHl: (row.hpsData[0].hpsAdd || []).map(p => Array.isArray(p.hl) ? p.hl.length : typeof p.hl),
  } : null,
  corner: Array.isArray(row?.hpsCorner) ? { n: row.hpsCorner.length, s0: summarizePlay(row.hpsCorner[0], "corner") } : typeof row?.hpsCorner,
  punish: Array.isArray(row?.hpsPunish) ? { n: row.hpsPunish.length, s0: summarizePlay(row.hpsPunish[0], "punish") } : typeof row?.hpsPunish,
}));

const detail = await post("/yewu11/v1/w/getMatchBaseInfoByOddsPB", {
  cuid, cos: 0, orpt: 0, euid, mid, mcid: 0, newUser: 0,
});
const env = detail.decoded || {};
const drow = Array.isArray(env.data) ? env.data[0] : env;
if (Array.isArray(env.playData) && drow)
  drow.playData = env.playData;
const plays = playsFromObMatchRow(drow);
const extracted = plays.flatMap(p => extractObPlaySelections(p));
const withSel = extracted.filter(r => r.selections.length);
const byHpn = {};
for (const r of withSel)
  byHpn[`${r.name}|${r.hpid}`] = (byHpn[`${r.name}|${r.hpid}`] || 0) + 1;
console.log("DETAIL", JSON.stringify({
  code: detail.code,
  playDataN: env.playData?.length,
  playsFromRow: plays.length,
  extracted: extracted.length,
  withSel: withSel.length,
  uniqueNames: Object.keys(byHpn).length,
  sampleNames: Object.keys(byHpn).slice(0, 40),
  p0keys: plays[0] && Object.keys(plays[0]),
  p0sum: plays[0] && summarizePlay(plays[0], "p0"),
}));
