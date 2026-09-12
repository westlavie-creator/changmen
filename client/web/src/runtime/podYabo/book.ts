/**
 * POD /events/{id} 逐档 NVP。副盘只能用该档自己的 NVP，不能拿警报 NVP 去套隔壁档。
 */
import type { PodBookLine, PodBookMarket } from "@/runtime/podAlerts";

const LINE_EPS = 1e-6;
export const POD_LOOSE_LINE_MAX = 0.25;

type BookSide = "over" | "under" | "home" | "away" | "draw";

export type PodBookNvpQuery = {
  eventId: string;
  period: number;
  market: PodBookMarket;
  side: BookSide;
  line: number;
};

function sameLine(left: number, right: number): boolean {
  return Math.abs(left - right) < LINE_EPS;
}

function nvpForSide(row: PodBookLine, side: BookSide): number {
  if (side === "over")
    return row.nvpOver;
  if (side === "under")
    return row.nvpUnder;
  if (side === "home")
    return row.nvpHome;
  if (side === "away")
    return row.nvpAway;
  return 0;
}

function bookHomeLine(row: PodBookLine, side: BookSide, want: number): boolean {
  if (row.market === "totals")
    return sameLine(row.line, want);
  if (row.market === "moneyline")
    return sameLine(row.line, 0);
  if (side === "home")
    return sameLine(row.line, want);
  if (side === "away")
    return sameLine(row.line, -want);
  return sameLine(row.line, want);
}

export function lookupPodBookNvp(books: PodBookLine[] | undefined, query: PodBookNvpQuery): number {
  if (!books?.length || !query.eventId)
    return 0;
  const period = Number(query.period) || 0;
  for (const row of books) {
    if (row.eventId !== query.eventId)
      continue;
    if ((Number(row.period) || 0) !== period)
      continue;
    if (row.market !== query.market)
      continue;
    if (!bookHomeLine(row, query.side, query.line))
      continue;
    const nvp = nvpForSide(row, query.side);
    if (nvp > 1)
      return nvp;
  }
  return 0;
}

/** 同场同期同玩法、与警报档不同、且不超过 0.25 的邻档（Pinnacle 主队线 / 大小线）。 */
export function listPodBookNeighbors(
  books: PodBookLine[] | undefined,
  query: Omit<PodBookNvpQuery, "side"> & { side: Exclude<BookSide, "draw"> },
): Array<{ line: number; nvp: number }> {
  if (!books?.length || !query.eventId)
    return [];
  const period = Number(query.period) || 0;
  const want = Number(query.line);
  if (!Number.isFinite(want))
    return [];
  const out: Array<{ line: number; nvp: number; delta: number }> = [];
  for (const row of books) {
    if (row.eventId !== query.eventId)
      continue;
    if ((Number(row.period) || 0) !== period)
      continue;
    if (row.market !== query.market)
      continue;
    const nvp = nvpForSide(row, query.side);
    if (!(nvp > 1))
      continue;
    const podLine = query.market === "spreads" && query.side === "away" ? -row.line : row.line;
    const delta = Math.abs(podLine - want);
    if (delta < LINE_EPS || delta > POD_LOOSE_LINE_MAX + LINE_EPS)
      continue;
    out.push({ line: podLine, nvp, delta });
  }
  out.sort((a, b) => a.delta - b.delta || b.nvp - a.nvp);
  return out.map(({ line, nvp }) => ({ line, nvp }));
}
