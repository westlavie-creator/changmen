/**
 * 熊猫体育订单状态。不走电竞 getOrders / Client_SaveOrder。
 *
 * [官网可证实] worker `R_CMD_ORDER_STATUS="C201"`；processBet 回包
 * `data.orderDetailRespList[].orderStatusCode===1` 表示受理成功（仍待结算）。
 * C201 `cd` 官方字段：`orderNo` / `status`（0/1 受理中，2/4 失败）。
 * [changmen 推测] 同包还可能带 outcome / profitAmount；仅在能解析出
 * Win/Lose/Reject/Return 时写库。queryOrderStatus 2/4 不要当成 outcome 2=赢。
 */
import type { FootballOrderStatus } from "@/runtime/podSportOrders";

export type ObSportOrderStatusPatch = {
  orderId: string;
  status: FootballOrderStatus;
  profit: number;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function namedStatus(raw: unknown): FootballOrderStatus | null {
  const s = str(raw).toLowerCase();
  if (s === "win")
    return "Win";
  if (s === "lose")
    return "Lose";
  if (s === "reject" || s === "rejected" || s === "cancel" || s === "cancelled")
    return "Reject";
  if (s === "return" || s === "void" || s === "draw" || s === "refund")
    return "Return";
  if (s === "none" || s === "pending")
    return "None";
  return null;
}

/**
 * 熊猫 outcome / win 常见 2=赢 3=输 4=走水。
 * [changmen 推测]
 */
function outcomeStatus(raw: unknown): FootballOrderStatus | null {
  const named = namedStatus(raw);
  if (named)
    return named;
  const n = num(raw);
  if (n === 2)
    return "Win";
  if (n === 3)
    return "Lose";
  if (n === 4)
    return "Return";
  return null;
}

function orderIdOf(row: Record<string, unknown>): string {
  return str(row.orderNo || row.order_no || row.orderId || row.order_id);
}

function profitOf(row: Record<string, unknown>): number | null {
  return num(row.profitAmount ?? row.profit_amount ?? row.profit ?? row.netAmount ?? row.net_amount);
}

function patchFromRow(raw: unknown): ObSportOrderStatusPatch | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;

  const named = namedStatus(row.status)
    || namedStatus(row.orderStatus)
    || outcomeStatus(row.outcome ?? row.betResult ?? row.win ?? row.winStatus ?? row.result);
  if (!named || named === "None")
    return null;

  const profitRaw = profitOf(row) ?? num(row.winAmount ?? row.settleAmount);
  let profit = profitRaw ?? 0;
  if (named === "Reject")
    profit = 0;
  return { orderId, status: named, profit };
}

/**
 * [官网可证实] query_order_status / C201 `status`：0/1 受理中，2/4 失败。
 * 不要把这个数字当成 outcome（2=赢）。
 */
export function patchFromObSportQueryStatus(raw: unknown): ObSportOrderStatusPatch | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const settled = patchFromRow(row);
  if (settled)
    return settled;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;
  const st = num(row.status);
  if (st === 2 || st === 4)
    return { orderId, status: "Reject", profit: 0 };
  return null;
}

function patchFromBetRecordRow(raw: unknown): ObSportOrderStatusPatch | null {
  const settled = patchFromRow(raw);
  if (settled)
    return settled;
  const row = asRecord(raw);
  if (!row)
    return null;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;
  const profit = profitOf(row);
  if (profit == null)
    return null;
  if (profit > 0)
    return { orderId, status: "Win", profit };
  if (profit < 0)
    return { orderId, status: "Lose", profit };
  const settledFlag = row.settleTime != null || row.isSettled === 1 || row.isSettled === true
    || str(row.orderStatus).toLowerCase() === "settled";
  if (settledFlag)
    return { orderId, status: "Return", profit: 0 };
  return null;
}

function collectRows(raw: unknown, out: unknown[], depth: number) {
  if (depth > 6 || raw == null)
    return;
  if (Array.isArray(raw)) {
    for (const item of raw)
      collectRows(item, out, depth + 1);
    return;
  }
  const row = asRecord(raw);
  if (!row)
    return;
  if (str(row.orderNo || row.order_no || row.orderId || row.order_id))
    out.push(row);
  for (const key of ["cd", "data", "list", "orders", "orderList", "orderDetailRespList", "seriesOrderRespList", "records"]) {
    if (row[key] != null)
      collectRows(row[key], out, depth + 1);
  }
}

const ORDER_CMDS = new Set(["C201", "C118"]);

function uniquePatches(items: unknown[], map: (raw: unknown) => ObSportOrderStatusPatch | null): ObSportOrderStatusPatch[] {
  const seen = new Set<string>();
  const out: ObSportOrderStatusPatch[] = [];
  for (const item of items) {
    const patch = map(item);
    if (!patch || seen.has(patch.orderId))
      continue;
    seen.add(patch.orderId);
    out.push(patch);
  }
  return out;
}

/** processBet / C201 共用。受理成功（code=1）不算结算。 */
export function parseObSportOrderStatusPush(msg: unknown): ObSportOrderStatusPatch[] {
  const root = asRecord(msg);
  const cmd = str(root?.cmd || root?.CMD).toUpperCase();
  if (cmd && !ORDER_CMDS.has(cmd) && cmd.startsWith("C") && cmd !== "C201")
    return [];
  const bag: unknown[] = [];
  collectRows(msg, bag, 0);
  return uniquePatches(bag, patchFromObSportQueryStatus);
}

/** [官网可证实] GET queryOrderStatus `data[]`：orderNo + status。 */
export function parseObSportQueryOrderStatus(decoded: unknown): ObSportOrderStatusPatch[] {
  const bag: unknown[] = [];
  collectRows(decoded, bag, 0);
  return uniquePatches(bag, patchFromObSportQueryStatus);
}

/** [changmen 推测] yewurecord 注单列表 records / list。只写能解析出盈亏的行。 */
export function parseObSportBetRecordList(decoded: unknown): ObSportOrderStatusPatch[] {
  const bag: unknown[] = [];
  collectRows(decoded, bag, 0);
  return uniquePatches(bag, patchFromBetRecordRow);
}

/**
 * [官网可证实] `orderDetailRespList[0].orderNo`；兼容 orderNos。
 */
export function orderIdFromObSportPlace(decoded: unknown): string {
  const row = asRecord(decoded) || {};
  const data = asRecord(row.data) || row;
  const details = data.orderDetailRespList;
  if (Array.isArray(details) && details[0]) {
    const first = asRecord(details[0]);
    const id = str(first?.orderNo || first?.orderId);
    if (id)
      return id;
  }
  for (const key of ["orderNos", "orders", "orderList"]) {
    const list = data[key];
    if (Array.isArray(list) && list[0]) {
      const first = asRecord(list[0]);
      const id = str(first?.orderNo || first?.orderId || first?.id);
      if (id)
        return id;
    }
  }
  return str(data.orderNo || data.orderId || data.id);
}

/** [官网可证实] orderStatusCode===1 受理；其它有码则视为未确认。 */
export function obSportPlaceAccepted(decoded: unknown): { ok: true; orderId: string } | { ok: false; message: string } {
  const row = asRecord(decoded) || {};
  const data = asRecord(row.data) || row;
  const details = Array.isArray(data.orderDetailRespList) ? asRecord(data.orderDetailRespList[0]) : null;
  const orderId = orderIdFromObSportPlace(decoded);
  const code = num(details?.orderStatusCode ?? data.orderStatusCode);
  if (code != null && code !== 1) {
    const msg = str(details?.msg || details?.message || data.msg || data.message);
    return { ok: false, message: msg || `场馆未确认(${code})` };
  }
  if (!orderId)
    return { ok: false, message: "场馆未返回单号" };
  return { ok: true, orderId };
}
