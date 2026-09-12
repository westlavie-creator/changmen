import { footballMarketTitle } from "@/runtime/footballMarketRows";
import { footballRowHasQuotes, footballRowVenues, type FootballObMarketRow } from "@/runtime/footballObMarkets";
import { OB_HPID_MARKET } from "@/runtime/obSportOdds";

export type FootballBookTab = "all" | "hot" | "ahou" | "ht" | "goals" | "cs" | "corners" | "other";
export type FootballBookColumnId = "ml" | "ah" | "ou" | "ht_ml" | "ht_ah" | "ht_ou" | "ht" | "goals" | "cs" | "corners" | "other";

/** 列表从左到右：全场/半场 独赢+让球+大小 */
export const FOOTBALL_BOOK_COLUMNS: { id: FootballBookColumnId; label: string }[] = [
  { id: "ml", label: "全场独赢" },
  { id: "ah", label: "全场让球" },
  { id: "ou", label: "全场大小" },
  { id: "ht_ml", label: "半场独赢" },
  { id: "ht_ah", label: "半场让球" },
  { id: "ht_ou", label: "半场大小" },
];

export type FootballBookKind = "ml" | "ah" | "ou" | "grid";

export type FootballBookSection = {
  key: string;
  title: string;
  kind: FootballBookKind;
  rows: FootballObMarketRow[];
};

export type FootballBookColumn = {
  id: FootballBookColumnId;
  label: string;
  sections: FootballBookSection[];
};

const COMPACT_LINE_CAP = 3;
const KIND_ORDER: Record<FootballBookKind, number> = { ml: 0, ah: 1, ou: 2, grid: 3 };

export function splitFootballTeams(title: string): { home: string; away: string } {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  const home = String(parts[0] || "").trim() || "主";
  const away = String(parts.slice(1).join(" vs ") || "").trim() || "客";
  return { home, away };
}

export function formatFootballLine(line: number | null | undefined): string {
  const n = Number(line);
  if (!Number.isFinite(n))
    return "";
  if (n > 0)
    return `+${n}`;
  return String(n);
}

export function footballRowKind(row: FootballObMarketRow): FootballBookKind {
  const hpid = String(row.hpid || "");
  const spec = hpid ? OB_HPID_MARKET[hpid] : undefined;
  if (spec?.marketCode === "moneyline")
    return "ml";
  if (spec?.marketCode === "spreads")
    return "ah";
  if (spec?.marketCode === "totals")
    return "ou";
  const code = String(row.MarketCode || "").toLowerCase();
  if (code === "moneyline" || code === "ht_moneyline" || code.endsWith("_moneyline"))
    return "ml";
  if (code === "spreads" || code === "ht_spreads" || code.endsWith("_spreads"))
    return "ah";
  if (code === "totals" || code === "ht_totals" || code.endsWith("_totals"))
    return "ou";
  const name = String(row.Name || "");
  if (/独赢|胜负/.test(name) && !/让球/.test(name))
    return "ml";
  if (/让球/.test(name) && !/大小/.test(name))
    return "ah";
  if (/大小/.test(name))
    return "ou";
  return "grid";
}

function isHalf(row: FootballObMarketRow): boolean {
  const hpid = String(row.hpid || "");
  const spec = hpid ? OB_HPID_MARKET[hpid] : undefined;
  if (spec?.period === "ht")
    return true;
  if (spec?.period === "ft")
    return false;
  const code = String(row.MarketCode || "").toLowerCase();
  const name = String(row.Name || "");
  const period = String(row.Period || "").toLowerCase();
  return code.startsWith("ht_") || period === "ht" || /半场|上半/.test(name);
}

function isCorrectScore(row: FootballObMarketRow): boolean {
  return /波胆|正确比分/.test(String(row.Name || ""));
}

function isCorners(row: FootballObMarketRow): boolean {
  return /角球/.test(String(row.Name || ""));
}

function isGoals(row: FootballObMarketRow): boolean {
  const name = String(row.Name || "");
  if (isCorrectScore(row) || isCorners(row))
    return false;
  const kind = footballRowKind(row);
  if (kind === "ml" || kind === "ah")
    return false;
  if (kind === "ou" && /大小/.test(name) && !/总进球|进球数/.test(name))
    return false;
  return /进球|单双|双方|净胜|零失球|最先|最后得分/.test(name);
}

function sectionTitle(kind: FootballBookKind, half: boolean, fallback: string): string {
  const prefix = half ? "半场" : "全场";
  if (kind === "ml")
    return `${prefix}独赢`;
  if (kind === "ah")
    return isCorners({ Name: fallback } as FootballObMarketRow) ? `${prefix}角球让球` : `${prefix}让球`;
  if (kind === "ou")
    return isCorners({ Name: fallback } as FootballObMarketRow) ? `${prefix}角球大小` : `${prefix}大小`;
  return footballMarketTitle({ Name: fallback, MarketCode: "", Line: null })
    .replace(/\s*[+-]?\d+(?:\.\d+)?\s*$/, "")
    .trim() || fallback || "盘口";
}

function inTab(row: FootballObMarketRow, tab: FootballBookTab): boolean {
  const kind = footballRowKind(row);
  const half = isHalf(row);
  const cs = isCorrectScore(row);
  const corners = isCorners(row);
  const goals = isGoals(row);
  if (tab === "all")
    return true;
  if (tab === "ht")
    return half && !cs;
  if (tab === "cs")
    return cs;
  if (tab === "corners")
    return corners;
  if (tab === "goals")
    return goals && !half;
  if (tab === "hot")
    return !half && !cs && !corners && (kind === "ml" || kind === "ah" || kind === "ou");
  if (tab === "ahou")
    return !half && !corners && (kind === "ah" || kind === "ou");
  return !half && !cs && !corners && !goals && kind === "grid";
}

function rowHas1x2(row: FootballObMarketRow): boolean {
  return footballRowVenues(row).some((v) => {
    const sels = v.Selections || [];
    const home = sels.some(s => String(s.Side || "").toLowerCase() === "home" && Number(s.Odds) > 0);
    const away = sels.some(s => String(s.Side || "").toLowerCase() === "away" && Number(s.Odds) > 0);
    return home && away;
  });
}

function isEvenMoneyMl(row: FootballObMarketRow): boolean {
  const n = Number(row.Line);
  return !Number.isFinite(n) || n === 0;
}

function inColumn(row: FootballObMarketRow, col: FootballBookColumnId): boolean {
  const kind = footballRowKind(row);
  const half = isHalf(row);
  const cs = isCorrectScore(row);
  const corners = isCorners(row);
  const goals = isGoals(row);
  if (col === "ht")
    return half && !cs;
  if (col === "cs")
    return cs;
  if (col === "corners")
    return corners;
  if (col === "goals")
    return goals && !half;
  if (col === "ml")
    return !half && kind === "ml" && rowHas1x2(row) && isEvenMoneyMl(row);
  if (col === "ht_ml")
    return half && kind === "ml" && rowHas1x2(row) && isEvenMoneyMl(row);
  if (col === "ah")
    return !half && !corners && kind === "ah";
  if (col === "ou")
    return !half && !corners && kind === "ou";
  if (col === "ht_ah")
    return half && !corners && kind === "ah";
  if (col === "ht_ou")
    return half && !corners && kind === "ou";
  return !half && !cs && !corners && !goals && kind === "grid";
}

function capCompactLines(rows: FootballObMarketRow[]): FootballObMarketRow[] {
  if (rows.length <= COMPACT_LINE_CAP)
    return rows;
  return [...rows]
    .sort((a, b) => Math.abs(Number(a.Line) || 0) - Math.abs(Number(b.Line) || 0))
    .slice(0, COMPACT_LINE_CAP)
    .sort((a, b) => (Number(a.Line) || 0) - (Number(b.Line) || 0));
}

function collectSections(
  rows: FootballObMarketRow[],
  pred: (row: FootballObMarketRow) => boolean,
  compact = false,
): FootballBookSection[] {
  const list = (rows || []).filter(r => footballRowHasQuotes(r) && pred(r));
  const byKey = new Map<string, FootballBookSection>();
  const order: string[] = [];
  for (const row of list) {
    const kind = footballRowKind(row);
    const half = isHalf(row);
    const corners = isCorners(row);
    const key = kind === "grid"
      ? `grid|${row.hpid || ""}|${row.Name || ""}`
      : `${half ? "ht" : "ft"}|${corners ? "cr" : "mn"}|${kind}`;
    let sec = byKey.get(key);
    if (!sec) {
      sec = {
        key,
        title: sectionTitle(kind, half, String(row.Name || "")),
        kind,
        rows: [],
      };
      byKey.set(key, sec);
      order.push(key);
    }
    sec.rows.push(row);
  }
  for (const sec of byKey.values()) {
    if (sec.kind === "ah" || sec.kind === "ou" || sec.kind === "ml") {
      sec.rows.sort((a, b) => (Number(a.Line) || 0) - (Number(b.Line) || 0));
      if (compact && sec.kind !== "ml")
        sec.rows = capCompactLines(sec.rows);
    }
  }
  return order
    .map(k => byKey.get(k)!)
    .filter(s => s.rows.length)
    .sort((a, b) => {
      const ha = a.key.startsWith("ht") ? 1 : 0;
      const hb = b.key.startsWith("ht") ? 1 : 0;
      if (ha !== hb)
        return ha - hb;
      return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
    });
}

/**
 * 按玩法整块分组（全场让球多线同一节），而不是每条线一张卡。
 */
export function groupFootballBook(
  rows: FootballObMarketRow[],
  tab: FootballBookTab,
): FootballBookSection[] {
  return collectSections(rows, r => inTab(r, tab), tab === "hot");
}

/** 从左到右六列；有任意主盘时六列都出（空列只留表头）。 */
export function groupFootballColumns(rows: FootballObMarketRow[]): FootballBookColumn[] {
  const cols = FOOTBALL_BOOK_COLUMNS.map(col => ({
    id: col.id,
    label: col.label,
    sections: collectSections(rows, r => inColumn(r, col.id)),
  }));
  if (!cols.some(col => col.sections.length))
    return [];
  return cols;
}
