/**
 * OB 体育盘口解码（gzip+base64 JSON、港水→欧赔、hpid 主盘映射）。
 * 仅 sport_* 路径使用；禁止写入电竞 client_matches。
 */
import zlib from "node:zlib";
import {
  MARKET_MONEYLINE,
  MARKET_SPREADS,
  MARKET_TOTALS,
} from "./sport_football_markets.js";

export const OB_FOOTBALL_ID_BASE = 820_000_000;

/** 列表主盘：全场/上半场 独赢、让球、大小 */
export const OB_FOOTBALL_LIST_HPIDS = new Set(["1", "4", "2", "17", "19", "18"]);

export const OB_HPID_MARKET = {
  1: { marketCode: MARKET_MONEYLINE, period: "ft" },
  17: { marketCode: MARKET_MONEYLINE, period: "ht" },
  25: { marketCode: MARKET_MONEYLINE, period: "q" },
  4: { marketCode: MARKET_SPREADS, period: "ft" },
  19: { marketCode: MARKET_SPREADS, period: "ht" },
  143: { marketCode: MARKET_SPREADS, period: "q" },
  2: { marketCode: MARKET_TOTALS, period: "ft" },
  18: { marketCode: MARKET_TOTALS, period: "ht" },
  26: { marketCode: MARKET_TOTALS, period: "q" },
};

export function round3(n) {
  const v = Number(n);
  if (!Number.isFinite(v))
    return 0;
  return Math.round(v * 1000) / 1000;
}

/**
 * 港水 → 十进制欧赔。+hk → 1+hk；-hk → 1+1/|hk|。
 * @param {unknown} hk
 */
export function hkToDecimal(hk) {
  const n = Number(hk);
  if (!Number.isFinite(n) || n === 0)
    return 0;
  if (n > 0)
    return round3(1 + n);
  return round3(1 + 1 / Math.abs(n));
}

/**
 * `2.5/3` → 2.75；单值原样。
 * @param {unknown} hv
 * @returns {number|null}
 */
export function parseObHandicapLine(hv) {
  const s = String(hv ?? "").trim();
  if (!s)
    return null;
  const parts = s.split("/").map(x => Number(String(x).trim())).filter(Number.isFinite);
  if (parts.length === 2)
    return round3((parts[0] + parts[1]) / 2);
  if (parts.length === 1)
    return parts[0];
  return null;
}

/**
 * @param {unknown} envelope `{ code, data }` 或已解压对象
 */
export function decodeObSportPbPayload(envelope) {
  if (envelope == null)
    return null;
  if (typeof envelope === "object" && envelope.data == null)
    return envelope;
  const data = envelope?.data;
  if (data && typeof data === "object")
    return data;
  if (typeof data !== "string" || !data.trim())
    return envelope;
  const buf = Buffer.from(data.replace(/\s/g, ""), "base64");
  let jsonText = "";
  try {
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b)
      jsonText = zlib.gunzipSync(buf).toString("utf8");
    else
      jsonText = buf.toString("utf8");
  }
  catch {
    try {
      jsonText = zlib.inflateSync(buf).toString("utf8");
    }
    catch {
      return null;
    }
  }
  try {
    return JSON.parse(jsonText);
  }
  catch {
    return null;
  }
}

function olOdds(ol) {
  if (!ol || typeof ol !== "object")
    return 0;
  if (ol.ov2 != null && ol.ov2 !== "")
    return hkToDecimal(ol.ov2);
  const ov = Number(ol.ov);
  if (!Number.isFinite(ov) || ov === 0)
    return 0;
  // 列表接口 ov 为欧赔 * 100000（如 189000 → 1.89）
  if (Math.abs(ov) >= 10_000)
    return round3(ov / 100_000);
  if (ov > 1)
    return round3(ov);
  return hkToDecimal(ov);
}

function olText(ol) {
  return [
    ol?.ot, ol?.ots, ol?.otn, ol?.on, ol?.onb, ol?.osn, ol?.na, ol?.otd, ol?.type,
  ].map(x => String(x ?? "")).join(" ");
}

/**
 * @param {object} ol
 * @param {number} index
 * @param {number} total
 * @returns {"home"|"away"|"draw"|"over"|"under"|"other"}
 */
export function classifyObOutcome(ol, index, total) {
  const raw = olText(ol).toLowerCase();
  if (/和局|平局|平|draw|\bx\b|tie/.test(raw) || String(ol?.ot ?? "").toUpperCase() === "X")
    return "draw";
  if (/大|over|\bo\b/.test(raw) && !/主|客|home|away/.test(raw))
    return "over";
  if (/小|under|\bu\b/.test(raw) && !/主|客|home|away/.test(raw))
    return "under";
  if (/主胜|主|home|^h$|(^|\s)1(\s|$)/.test(raw))
    return "home";
  if (/客胜|客|away|^a$|(^|\s)2(\s|$)/.test(raw))
    return "away";
  if (total === 3)
    return index === 0 ? "home" : index === 1 ? "draw" : "away";
  if (total === 2)
    return index === 0 ? "home" : "away";
  return "other";
}

function asHlList(hl) {
  if (Array.isArray(hl))
    return hl.filter(Boolean);
  if (hl && typeof hl === "object" && (Array.isArray(hl.ol) || hl.hv != null || hl.hid))
    return [hl];
  return [];
}

function playLines(play) {
  const nested = Array.isArray(play?.hps) ? play.hps : play?.hps ? [play.hps] : [];
  const bags = nested.length ? nested : [play];
  /** @type {object[]} */
  const lines = [];
  for (const hp of bags) {
    const hls = asHlList(hp?.hl);
    if (hls.length) {
      for (const hl of hls)
        lines.push(hl);
      continue;
    }
    if (Array.isArray(hp?.ol) && hp.ol.length)
      lines.push({ hv: hp.hv, ol: hp.ol });
  }
  if (!lines.length) {
    for (const hl of asHlList(play?.hl))
      lines.push(hl);
  }
  return lines;
}

const EXTRA_HPS_BAG_KEYS = [
  "hpsCorner", "hpsPunish", "hpsTCorner", "hpsTPunish",
  "hpsBold", "hpsTBold", "hpsCompose", "hpsPromotion", "hpsPenalty",
  "hpsOvertime", "hps5Minutes", "hps15Minutes",
];

function pushPlayList(plays, list) {
  if (!Array.isArray(list))
    return;
  for (const p of list) {
    if (p && typeof p === "object")
      plays.push(p);
  }
}

/**
 * 列表接口 structureMatchBaseInfoByMidsPB 的 hpsData（含 hpsAdd 多线），或详情 playData。
 * 角球等袋在列表里常为空，详情偶发挂在 hpsCorner 而非 playData。
 * @param {object} row
 */
export function playsFromObMatchRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row))
    return [];
  /** @type {object[]} */
  const plays = [];
  if (Array.isArray(row.playData) && row.playData.length)
    pushPlayList(plays, row.playData);
  const bags = Array.isArray(row.hpsData)
    ? row.hpsData
    : row.hpsData
      ? [row.hpsData]
      : [];
  for (const bag of bags) {
    pushPlayList(plays, bag?.hps);
    pushPlayList(plays, bag?.hpsAdd);
  }
  for (const key of EXTRA_HPS_BAG_KEYS)
    pushPlayList(plays, row[key]);
  return plays;
}

/**
 * @param {object} play playData 项
 */
export function extractObPlaySelections(play) {
  const hpid = String(play?.hpid ?? play?.hpId ?? "");
  const spec = OB_HPID_MARKET[hpid];
  const marketCode = spec?.marketCode || `ob:${hpid || "x"}`;
  const period = spec?.period || "";
  const name = String(play?.hpn || play?.title || play?.n || marketCode);
  /** @type {object[]} */
  const rows = [];
  for (const hl of playLines(play)) {
    const ols = Array.isArray(hl?.ol) ? hl.ol : [];
    const line = parseObHandicapLine(hl?.hv ?? play?.hv);
    /** @type {object[]} */
    const selections = [];
    for (let i = 0; i < ols.length; i++) {
      const ol = ols[i];
      const side = classifyObOutcome(ol, i, ols.length);
      selections.push({
        side,
        oid: String(ol?.oid ?? ol?.id ?? ""),
        odds: olOdds(ol),
        name: String(ol?.on || ol?.otn || ol?.na || side),
      });
    }
    rows.push({
      hpid,
      marketCode,
      period,
      name,
      line,
      selections,
    });
  }
  if (!rows.length) {
    rows.push({
      hpid,
      marketCode,
      period,
      name,
      line: parseObHandicapLine(play?.hv),
      selections: [],
    });
  }
  return rows;
}

function pickSide(selections, side) {
  return selections.find(s => s.side === side) || null;
}

/**
 * 列表用：主盘 6 个 hpid + 列表袋里其它 2/3 项玩法（角球等）。波胆等 N 向留给详情。
 * @param {object[]} playData
 */
export function listBetsFromObPlayData(playData) {
  const plays = Array.isArray(playData) ? playData : [];
  /** @type {object[]} */
  const bets = [];
  for (const play of plays) {
    const hpid = String(play?.hpid ?? "");
    const spec = OB_HPID_MARKET[hpid];
    for (const row of extractObPlaySelections(play)) {
      const live = row.selections.filter(s => s.oid || s.odds > 0);
      if (live.length < 2)
        continue;
      if (!spec && live.length > 3)
        continue;
      const totalsLike = spec?.marketCode === MARKET_TOTALS
        || live.some(s => s.side === "over" || s.side === "under");
      const home = pickSide(row.selections, totalsLike ? "over" : "home")
        || row.selections[0]
        || { oid: "", odds: 0 };
      const away = pickSide(row.selections, totalsLike ? "under" : "away")
        || row.selections[1]
        || { oid: "", odds: 0 };
      const draw = pickSide(row.selections, "draw");
      const marketCode = spec
        ? (spec.period === "ht" ? `ht_${spec.marketCode}` : spec.marketCode)
        : `ob:${hpid || "x"}`;
      const line = spec?.marketCode === MARKET_MONEYLINE ? null : row.line;
      bets.push({
        marketCode,
        line,
        name: row.name,
        period: spec?.period || "",
        hpid,
        homeOid: home.oid,
        awayOid: away.oid,
        drawOid: draw?.oid || "",
        homeOdds: home.odds,
        awayOdds: away.odds,
        drawOdds: draw?.odds || 0,
      });
    }
  }
  return bets;
}
