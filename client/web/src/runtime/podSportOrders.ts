/**
 * 足球 POD 已下订单。只存在本机，不进电竞侧栏订单 / RDS。
 */
import { formatPodAgo, formatPodPrice } from "@/runtime/podAlerts";
import { formatPodStake } from "@/runtime/podBetTicket";

export const POD_SPORT_ORDERS_KEY = "changmen:podSportOrders";
export const POD_SPORT_ORDERS_UPDATED = "changmen:pod-sport-orders-updated";
export const POD_SPORT_ORDERS_MAX = 100;

export type PodSportOrder = {
  id: string;
  orderId: string;
  at: number;
  home: string;
  away: string;
  sideLabel: string;
  marketLabel: string;
  odds: number;
  stake: number;
  oid: string;
  obMid: string;
  auto: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parsePodSportOrder(raw: unknown): PodSportOrder | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const id = str(row.id);
  if (!id)
    return null;
  return {
    id,
    orderId: str(row.orderId),
    at: num(row.at),
    home: str(row.home),
    away: str(row.away),
    sideLabel: str(row.sideLabel),
    marketLabel: str(row.marketLabel),
    odds: num(row.odds),
    stake: num(row.stake),
    oid: str(row.oid),
    obMid: str(row.obMid),
    auto: row.auto === true,
  };
}

export function parsePodSportOrders(raw: unknown): PodSportOrder[] {
  const list = Array.isArray(raw) ? raw : asRecord(raw)?.rows;
  if (!Array.isArray(list))
    return [];
  const out: PodSportOrder[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const row = parsePodSportOrder(item);
    if (!row)
      continue;
    const keys = [row.id, row.orderId].filter(Boolean);
    if (keys.some(key => seen.has(key)))
      continue;
    for (const key of keys)
      seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return out.slice(0, POD_SPORT_ORDERS_MAX);
}

function writeOrders(rows: PodSportOrder[]): PodSportOrder[] {
  const next = parsePodSportOrders(rows);
  try {
    localStorage.setItem(POD_SPORT_ORDERS_KEY, JSON.stringify(next));
  }
  catch { /* quota */ }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(POD_SPORT_ORDERS_UPDATED));
  return next;
}

export function readPodSportOrders(): PodSportOrder[] {
  try {
    const raw = localStorage.getItem(POD_SPORT_ORDERS_KEY);
    if (!raw)
      return [];
    return parsePodSportOrders(JSON.parse(raw));
  }
  catch {
    return [];
  }
}

export function appendPodSportOrder(row: PodSportOrder): PodSportOrder[] {
  const parsed = parsePodSportOrder(row);
  if (!parsed)
    return readPodSportOrders();
  const rows = readPodSportOrders();
  if (rows.some(item => item.id === parsed.id || (parsed.orderId && item.orderId === parsed.orderId)))
    return rows;
  return writeOrders([parsed, ...rows]);
}

/** 跟单票是否已有本机体育成单（清空跟单列表不得再下）。 */
export function hasPodSportOrder(id: string): boolean {
  const want = String(id || "").trim();
  if (!want)
    return false;
  return readPodSportOrders().some(row => row.id === want);
}

export function listPodSportOrderedIds(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of readPodSportOrders()) {
    const id = String(row.id || "").trim();
    if (!id || seen.has(id))
      continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function localDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 体育侧栏统计：全部本机单数 + 当日已下金额（不是电竞当日盈亏）。 */
export function summarizePodSportOrders(now = Date.now()): { count: number; todayStake: number } {
  const rows = readPodSportOrders();
  const start = localDayStart(now);
  let todayStake = 0;
  for (const row of rows) {
    if (row.at >= start)
      todayStake += Number(row.stake) || 0;
  }
  return { count: rows.length, todayStake };
}

export function formatPodSportOrderTitle(row: Pick<PodSportOrder, "home" | "away">): string {
  return `${row.home} vs ${row.away}`.trim() || "足球";
}

export function formatPodSportOrderMeta(row: Pick<PodSportOrder, "odds" | "stake" | "at" | "auto" | "orderId">, now = Date.now()): string {
  const bits = [
    formatPodStake(row.stake),
    `@ ${formatPodPrice(row.odds)}`,
    formatPodAgo(row.at, now),
  ];
  if (row.auto)
    bits.push("自动");
  if (row.orderId)
    bits.push(row.orderId);
  return bits.join(" · ");
}
