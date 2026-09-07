/**
 * OB 体育盘口解码（港水→欧赔、hpid 主盘）。仅足球采集用，不写电竞 fo。
 */

export const OB_FOOTBALL_ID_BASE = 820_000_000;

export const OB_HPID_MARKET: Record<string, { marketCode: string; period: string }> = {
  1: { marketCode: "moneyline", period: "ft" },
  17: { marketCode: "moneyline", period: "ht" },
  25: { marketCode: "moneyline", period: "q" },
  4: { marketCode: "spreads", period: "ft" },
  19: { marketCode: "spreads", period: "ht" },
  143: { marketCode: "spreads", period: "q" },
  2: { marketCode: "totals", period: "ft" },
  18: { marketCode: "totals", period: "ht" },
  26: { marketCode: "totals", period: "q" },
};

export function round3(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v))
    return 0;
  return Math.round(v * 1000) / 1000;
}

export function hkToDecimal(hk: unknown): number {
  const n = Number(hk);
  if (!Number.isFinite(n) || n === 0)
    return 0;
  if (n > 0)
    return round3(1 + n);
  return round3(1 + 1 / Math.abs(n));
}

export function parseObHandicapLine(hv: unknown): number | null {
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

function olOdds(ol: Record<string, unknown> | null | undefined): number {
  if (!ol)
    return 0;
  if (ol.ov2 != null && ol.ov2 !== "")
    return hkToDecimal(ol.ov2);
  const ov = Number(ol.ov);
  if (!Number.isFinite(ov) || ov === 0)
    return 0;
  if (Math.abs(ov) >= 10_000)
    return round3(ov / 100_000);
  if (ov > 1)
    return round3(ov);
  return hkToDecimal(ov);
}

function olText(ol: Record<string, unknown>): string {
  return [ol.ot, ol.ots, ol.otn, ol.on, ol.onb, ol.osn, ol.na, ol.otd, ol.type]
    .map(x => String(x ?? "")).join(" ");
}

export type ObOutcomeSide = "home" | "away" | "draw" | "over" | "under" | "other";

export function classifyObOutcome(ol: Record<string, unknown>, index: number, total: number): ObOutcomeSide {
  const raw = olText(ol).toLowerCase();
  if (/和局|平局|平|draw|\bx\b|tie/.test(raw) || String(ol.ot ?? "").toUpperCase() === "X")
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

function asHlList(hl: unknown): object[] {
  if (Array.isArray(hl))
    return hl.filter(Boolean);
  if (hl && typeof hl === "object" && (Array.isArray((hl as { ol?: unknown }).ol) || "hv" in hl || "hid" in hl))
    return [hl];
  return [];
}

function playLines(play: Record<string, unknown>): Record<string, unknown>[] {
  const nested = Array.isArray(play.hps) ? play.hps : play.hps ? [play.hps] : [];
  const bags = nested.length ? nested : [play];
  const lines: Record<string, unknown>[] = [];
  for (const hp of bags as Record<string, unknown>[]) {
    const hls = asHlList(hp?.hl);
    if (hls.length) {
      for (const row of hls)
        lines.push(row as Record<string, unknown>);
      continue;
    }
    if (Array.isArray(hp?.ol) && hp.ol.length)
      lines.push({ hv: hp.hv, ol: hp.ol });
  }
  if (!lines.length) {
    for (const hl of asHlList(play.hl))
      lines.push(hl as Record<string, unknown>);
  }
  return lines;
}

const EXTRA_HPS_BAG_KEYS = [
  "hpsCorner", "hpsPunish", "hpsTCorner", "hpsTPunish",
  "hpsBold", "hpsTBold", "hpsCompose", "hpsPromotion", "hpsPenalty",
  "hpsOvertime", "hps5Minutes", "hps15Minutes",
];

function pushPlayList(plays: Record<string, unknown>[], list: unknown) {
  if (!Array.isArray(list))
    return;
  for (const p of list) {
    if (p && typeof p === "object")
      plays.push(p as Record<string, unknown>);
  }
}

export function playsFromObMatchRow(row: unknown): Record<string, unknown>[] {
  if (!row || typeof row !== "object" || Array.isArray(row))
    return [];
  const src = row as Record<string, unknown>;
  const plays: Record<string, unknown>[] = [];
  if (Array.isArray(src.playData) && src.playData.length)
    pushPlayList(plays, src.playData);
  const bags = Array.isArray(src.hpsData) ? src.hpsData : src.hpsData ? [src.hpsData] : [];
  for (const bag of bags as Record<string, unknown>[]) {
    pushPlayList(plays, bag?.hps);
    pushPlayList(plays, bag?.hpsAdd);
  }
  for (const key of EXTRA_HPS_BAG_KEYS)
    pushPlayList(plays, src[key]);
  return plays;
}

export type ObPlaySelectionRow = {
  hpid: string;
  marketCode: string;
  period: string;
  name: string;
  line: number | null;
  selections: Array<{ side: ObOutcomeSide; oid: string; odds: number; name: string }>;
};

export function extractObPlaySelections(play: Record<string, unknown>): ObPlaySelectionRow[] {
  const hpid = String(play.hpid ?? play.hpId ?? "");
  const spec = OB_HPID_MARKET[hpid];
  const marketCode = spec?.marketCode || `ob:${hpid || "x"}`;
  const period = spec?.period || "";
  const name = String(play.hpn || play.title || play.n || marketCode);
  const rows: ObPlaySelectionRow[] = [];
  for (const hl of playLines(play)) {
    const ols = Array.isArray(hl.ol) ? hl.ol as Record<string, unknown>[] : [];
    const line = parseObHandicapLine(hl.hv ?? play.hv);
    const selections = ols.map((ol, i) => {
      const side = classifyObOutcome(ol, i, ols.length);
      return {
        side,
        oid: String(ol.oid ?? ol.id ?? ""),
        odds: olOdds(ol),
        name: String(ol.on || ol.otn || ol.na || side),
      };
    });
    rows.push({ hpid, marketCode, period, name, line, selections });
  }
  if (!rows.length) {
    rows.push({
      hpid,
      marketCode,
      period,
      name,
      line: parseObHandicapLine(play.hv),
      selections: [],
    });
  }
  return rows;
}

function pickSide(selections: ObPlaySelectionRow["selections"], side: string) {
  return selections.find(s => s.side === side) || null;
}

export function listBetsFromObPlayData(playData: unknown[]): Array<{
  marketCode: string;
  line: number | null;
  name: string;
  period: string;
  hpid: string;
  homeOid: string;
  awayOid: string;
  drawOid: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number;
}> {
  const plays = Array.isArray(playData) ? playData : [];
  const bets = [];
  for (const play of plays) {
    if (!play || typeof play !== "object")
      continue;
    const hpid = String((play as { hpid?: unknown }).hpid ?? "");
    const spec = OB_HPID_MARKET[hpid];
    for (const row of extractObPlaySelections(play as Record<string, unknown>)) {
      const live = row.selections.filter(s => s.oid || s.odds > 0);
      if (live.length < 2)
        continue;
      if (!spec && live.length > 3)
        continue;
      const totalsLike = spec?.marketCode === "totals"
        || live.some(s => s.side === "over" || s.side === "under");
      const home = pickSide(row.selections, totalsLike ? "over" : "home")
        || row.selections[0]
        || { oid: "", odds: 0, side: "home" as const, name: "" };
      const away = pickSide(row.selections, totalsLike ? "under" : "away")
        || row.selections[1]
        || { oid: "", odds: 0, side: "away" as const, name: "" };
      const draw = pickSide(row.selections, "draw");
      const marketCode = spec
        ? (spec.period === "ht" ? `ht_${spec.marketCode}` : spec.marketCode)
        : `ob:${hpid || "x"}`;
      bets.push({
        marketCode,
        line: spec?.marketCode === "moneyline" ? null : row.line,
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
