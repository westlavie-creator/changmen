/**
 * 足球 POD 订单 DTO / 展示。数据在 Pinia + RDS football_orders。
 * 禁止 localStorage、Client_SaveOrder / 电竞 orderStore。
 */
import { formatPodAgo, formatPodPrice } from "@/runtime/podAlerts";
import { formatPodStake } from "@/runtime/podBetTicket";

/** 与电竞订单栏 Client_GetOrderList pageSize 保持一致。 */
export const POD_SPORT_ORDERS_MAX = 1024;

export type FootballOrderStatus = "None" | "Pending" | "Win" | "Lose" | "Reject" | "Return";

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
  pmMatchId?: string;
  auto: boolean;
  status: FootballOrderStatus;
  profit: number;
  rdsId?: number;
  venue?: string;
  playerId?: number;
  accountName?: string;
  userId?: string;
  userName?: string;
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

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function normalizeFootballOrderStatus(raw: unknown): FootballOrderStatus {
  const s = str(raw).toLowerCase();
  if (s === "win")
    return "Win";
  if (s === "lose")
    return "Lose";
  if (s === "reject" || s === "rejected")
    return "Reject";
  if (s === "return" || s === "void")
    return "Return";
  if (s === "pending")
    return "Pending";
  return "None";
}

export function isFootballOrderPending(status: unknown): boolean {
  const s = normalizeFootballOrderStatus(status);
  return s === "None" || s === "Pending";
}

export function footballOrderSettledProfit(row: Pick<PodSportOrder, "status" | "profit">): number {
  if (isFootballOrderPending(row.status))
    return 0;
  return Number(row.profit) || 0;
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
    pmMatchId: str(row.pmMatchId) || undefined,
    auto: truthy(row.auto),
    status: normalizeFootballOrderStatus(row.status),
    profit: num(row.profit),
    rdsId: num(row.rdsId) || undefined,
    venue: str(row.venue) || undefined,
    playerId: num(row.playerId) || undefined,
    accountName: str(row.accountName) || undefined,
    userId: str(row.userId) || undefined,
    userName: str(row.userName) || undefined,
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

/** 内存列表插入/覆盖一单（对齐电竞侧栏：只改 Pinia，不写磁盘）。 */
export function mergePodSportOrder(rows: PodSportOrder[], row: PodSportOrder): PodSportOrder[] {
  const parsed = parsePodSportOrder(row);
  if (!parsed)
    return parsePodSportOrders(rows);
  const prev = rows.find(item =>
    item.id === parsed.id || (parsed.orderId && item.orderId === parsed.orderId),
  );
  const next = prev && isFootballOrderPending(parsed.status) && !isFootballOrderPending(prev.status)
    ? { ...parsed, status: prev.status, profit: prev.profit }
    : parsed;
  const rest = rows.filter(item =>
    item.id !== next.id && !(next.orderId && item.orderId === next.orderId),
  );
  return parsePodSportOrders([next, ...rest]);
}

function localDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 体育侧栏统计：单数 + 当日已下 + 已结算盈亏（待结算不计）。 */
export function summarizePodSportOrders(rows: PodSportOrder[], now = Date.now()): {
  count: number;
  todayStake: number;
  todayProfit: number;
} {
  const start = localDayStart(now);
  let todayStake = 0;
  let todayProfit = 0;
  for (const row of rows) {
    if (row.at < start)
      continue;
    todayStake += Number(row.stake) || 0;
    todayProfit += footballOrderSettledProfit(row);
  }
  return { count: rows.length, todayStake, todayProfit };
}

export type PodSportOrderGroup = {
  key: string;
  legend: string;
  legendClass: "default" | "success" | "fail";
  rows: PodSportOrder[];
};

/** 侧栏 fieldset：按比赛分组。全结算后图例改盈亏（对齐电竞 legend success/fail）。 */
export function groupPodSportOrders(rows: PodSportOrder[]): PodSportOrderGroup[] {
  const map = new Map<string, PodSportOrder[]>();
  for (const row of rows) {
    const key = row.obMid || `${row.home}|${row.away}` || row.id;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const groups: PodSportOrderGroup[] = [];
  for (const [key, list] of map) {
    const pending = list.some(row => isFootballOrderPending(row.status));
    const stake = list.reduce((sum, row) => sum + (Number(row.stake) || 0), 0);
    const profit = list.reduce((sum, row) => sum + footballOrderSettledProfit(row), 0);
    const value = pending ? stake : profit;
    groups.push({
      key,
      legend: String(Math.round(value)),
      legendClass: pending || profit === 0 ? "default" : profit > 0 ? "success" : "fail",
      rows: list,
    });
  }
  groups.sort((a, b) => (b.rows[0]?.at || 0) - (a.rows[0]?.at || 0) || a.key.localeCompare(b.key));
  return groups;
}

export function formatPodSportOrderTitle(row: Pick<PodSportOrder, "home" | "away">): string {
  const home = String(row.home || "").trim();
  const away = String(row.away || "").trim();
  if (home && away)
    return `${home} vs ${away}`;
  return home || away || "足球";
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
