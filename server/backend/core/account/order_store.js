import * as sb from "@changmen/db";
import { parseVenueCreateAt } from "@changmen/shared/time/match_time";
import { isAdminUser } from "../auth/admin_auth.js";
import { toDateKey } from "./order/date_key.js";
import {
  parseNum,
  rowToOrder,
  toClientOrder,
} from "./order/dto.js";
import { isPredictionSellForCount } from "./order/kinds.js";
import {
  enrichOrdersBelongingToDate,
  findOrderRowById,
  resolveSaveOrderLink,
} from "./order/link.js";
import { mergeOtherProviderLogicalSave } from "./order/save_non_pm.js";
import { mergePredictFunLogicalSave } from "./order/save_pf.js";
import { mergePolymarketProviderSave } from "./order/save_pm.js";
import { applyPositionEventsOnSave } from "./order/position_events.js";

export { toDateKey } from "./order/date_key.js";
export {
  resolveStoredLink,
  resolvePfHoldSharesFromRaw,
  rowToOrder,
  scrubClientOrder,
  toClientOrder,
} from "./order/dto.js";
export { isPredictionSellForCount } from "./order/kinds.js";
export {
  alignRawPredictionSellLinksToBuys,
  enrichOrdersBelongingToDate,
  findOrderRowById,
  mergePredictionBuySellSiblings,
} from "./order/link.js";
export {
  applyPositionEventsOnSave,
  collectIncomingPositionSellEvents,
  normalizePositionSellEvent,
  readPositionSellEvents,
  upsertPositionSellEvents,
} from "./order/position_events.js";

function mapStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "win")
    return "Win";
  if (s === "lose")
    return "Lose";
  if (s === "reject")
    return "Reject";
  if (s === "return")
    return "Return";
  if (s === "pending")
    return "Pending";
  return "None";
}

/**
 * saveOrder 落库合并入口。
 * 三平行分支：Polymarket ‖ PredictFun ‖ 其它场馆。
 * （旧名 mergePolymarketLogicalSave：历史误导，已废弃不留别名。）
 * @internal 单测 / 手动卖出本金合并
 */
export function mergeOrderLogicalSave(prevRow, prevRaw, o, pmOrigin) {
  const provider = String(o.provider || o.Type || prevRow?.provider || "").trim();
  const merged = pmOrigin ? { ...o, pmOrigin } : { ...o };
  const money = parseNum(o.money ?? o.Money, 0);
  const bet_money = parseNum(o.betMoney ?? o.BetMoney, 0);

  let result;
  if (provider === "Polymarket") {
    result = mergePolymarketProviderSave(prevRow, prevRaw, o, pmOrigin, merged, money, bet_money);
  }
  else if (provider === "PredictFun") {
    result = mergePredictFunLogicalSave(prevRow, prevRaw, merged, money, bet_money);
  }
  else {
    result = mergeOtherProviderLogicalSave(merged, prevRaw, money, bet_money);
  }

  const sidePm = String(result.raw?.pmSide || o.pmSide || "").trim().toLowerCase();
  const sidePf = String(result.raw?.pfSide || o.pfSide || "").trim().toLowerCase();
  // 按 provider 判卖单行，避免 PF 买单误带 pmSide=sell 时剥掉 positionEvents
  const isSellRow = provider === "Polymarket"
    ? sidePm === "sell"
    : provider === "PredictFun"
      ? sidePf === "sell"
      : false;
  applyPositionEventsOnSave(result.raw, prevRaw || {}, o, { isSellRow });
  return result;
}

export async function listByDate(date, userId) {
  const target = date || toDateKey(Date.now());
  const rows = await sb.fetchOrdersByDate(target, userId);
  return rows.map(toClientOrder);
}

export async function listByDatePage(date, userId, pageIndex = 1, pageSize = 1024) {
  const target = date || toDateKey(Date.now());
  const page = Math.max(1, Number(pageIndex) || 1);
  const size = Math.max(1, Number(pageSize) || 1024);
  const { rows } = await sb.fetchOrdersByDatePage(target, userId, page, size);
  // [changmen 扩展] 同 Link + buyId 跨日并入；卖单归买单日
  const merged = await enrichOrdersBelongingToDate(rows || [], target, { userId });
  const list = merged.map(toClientOrder);
  return { list, total: list.length };
}

export async function listByPlayer(playerId, userId) {
  const rows = await sb.fetchOrdersByPlayer(playerId, userId);
  return rows.map(rowToOrder);
}

export async function saveOrder(playerId, orders, userId, typeFallback = "") {
  if (!userId || !Array.isArray(orders))
    return false;
  if (!orders.length)
    return true;
  const defaultProvider = String(typeFallback || "").trim();
  // [changmen 扩展] 允许 changmen 手动卖单落库（同 Link + pmBuyOrderId / pfBuyOrderId）
  const incoming = orders;
  if (!incoming.length)
    return true;
  const incomingResolved = incoming.map((o) => {
    const rawCreate = o.createAt ?? o.CreateAt;
    const parsed = parseVenueCreateAt(rawCreate, 0);
    const fallbackAt = parsed > 0 ? parsed : Date.now();
    const orderId = String(o.orderId || `${playerId}-${fallbackAt}`);
    return { o, orderId, parsed, fallbackAt };
  });
  const prefetchOrderIds = [];
  for (const { o, orderId } of incomingResolved) {
    prefetchOrderIds.push(orderId);
    const buyOrderId = String(
      o.pmBuyOrderId ?? o.PmBuyOrderId ?? o.pfBuyOrderId ?? o.PfBuyOrderId ?? "",
    ).trim();
    if (buyOrderId)
      prefetchOrderIds.push(buyOrderId);
  }
  const existing = await sb.fetchOrdersByPlayerOrderIds(playerId, userId, prefetchOrderIds);
  const linkByOrderId = new Map(
    existing.map(r => [String(r.order_id), Number(r.link) || 0]),
  );
  const existingByOrderId = new Map(
    existing.map(r => [String(r.order_id), r]),
  );

  const assignedInBatch = new Map();
  const rows = [];
  for (const { o, orderId, parsed, fallbackAt } of incomingResolved) {
    // 本单 prev：order_id 大小写不敏感；命中后 upsert 主键用库内形态，避免 ON CONFLICT 插出重复行
    const prevRow = findOrderRowById(existingByOrderId, orderId);
    const storedOrderId = prevRow?.order_id != null && String(prevRow.order_id).trim()
      ? String(prevRow.order_id).trim()
      : orderId;
    const prevAt = Number(prevRow?.create_at) || 0;
    const createAt = parsed > 0 ? parsed : prevAt > 0 ? prevAt : fallbackAt;
    const prevRaw = prevRow?.raw && typeof prevRow.raw === "object" && !Array.isArray(prevRow.raw)
      ? prevRow.raw
      : {};
    // typeFallback（如 upsertPfServerOrder）必须进入 merge，否则 PF 保护/卖单 meta 会漏判
    const provider = String(o.provider || o.Type || defaultProvider || prevRow?.provider || "").trim();
    const orderForMerge = provider && !o.provider && !o.Type
      ? { ...o, provider }
      : o;
    const link = resolveSaveOrderLink(
      orderForMerge,
      prevRaw,
      orderId,
      createAt,
      linkByOrderId,
      existingByOrderId,
      assignedInBatch,
      provider,
    );
    assignedInBatch.set(orderId, link);
    if (storedOrderId !== orderId)
      assignedInBatch.set(storedOrderId, link);
    const incomingOrigin = o.pmOrigin;
    const prevOrigin = prevRaw.pmOrigin;
    let pmOrigin = incomingOrigin;
    if (prevOrigin === "changmen" && incomingOrigin === "external")
      pmOrigin = "changmen";
    else if (!pmOrigin)
      pmOrigin = prevOrigin || (provider === "Polymarket" ? "external" : undefined);
    const { raw, money, bet_money } = mergeOrderLogicalSave(
      prevRow,
      prevRaw,
      orderForMerge,
      pmOrigin,
    );
    rows.push({
      user_id: String(userId),
      player_id: Number(playerId),
      order_id: storedOrderId,
      link,
      provider,
      match: o.match || o.Match || "",
      bet: o.bet || o.Bet || "",
      item: o.item || o.Item || "",
      odds: parseNum(o.odds, 0),
      bet_money,
      money,
      status: mapStatus(raw.status ?? o.status ?? o.Status),
      create_at: createAt,
      raw,
    });
  }
  return rows.length ? await sb.upsertOrders(rows) : true;
}

function isUuidUserId(userId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId ?? ""));
}

function stringToHashNumber(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** 排行榜：按登录用户聚合当日 orders（非按 player_id / 平台账号）；管理员不参与 */
export async function listUserProfitRank(dateKey = toDateKey(Date.now())) {
  const [orders, profiles] = await Promise.all([
    sb.fetchOrdersForProfitAggregate(dateKey),
    sb.fetchProfiles(),
  ]);
  const adminIds = new Set(
    (profiles || []).filter(p => isAdminUser(p)).map(p => String(p.id)),
  );
  const nameById = new Map(
    (profiles || []).map(p => [String(p.id), String(p.user_name || "").trim()]),
  );
  const agg = new Map();
    for (const o of orders || []) {
      const uid = String(o.user_id || "");
      if (!uid || adminIds.has(uid))
        continue;
      if (!agg.has(uid))
        agg.set(uid, { money: 0, count: 0, betMoney: 0 });
      const row = agg.get(uid);
      const status = String(o.status || "");
      if (status === "Reject")
        continue;
      row.money += Number(o.money) || 0;
      // 笔数 / 流水均不计 PM/PF 卖单；盈亏仍汇总该行（卖单 money 多为 0）
      if (!isPredictionSellForCount(o)) {
        row.count += 1;
        row.betMoney += Number(o.bet_money) || 0;
      }
    }
  const result = [];
  for (const [uid, stats] of agg) {
    if (adminIds.has(uid))
      continue;
    const userName = nameById.get(uid) || uid.slice(0, 8);
    result.push({
      UserID: stringToHashNumber(userName),
      UserName: userName,
      Money: stats.money,
      Count: stats.count,
      BetMoney: stats.betMoney,
      Date: dateKey,
    });
  }
  return result.sort((a, b) => b.Money - a.Money);
}

/** 解析 Client_SaveOrderBind 单行（对齐 A8 `nA`：LinkID + Provider + OrderID） */
export function parseOrderBindRow(row) {
  return {
    orderId: String(row?.orderId ?? row?.OrderID ?? ""),
    playerId: Number(row?.playerId ?? row?.PlayerID) || 0,
    linkId: Number(row?.linkId ?? row?.LinkID) || 0,
    provider: String(row?.Provider ?? row?.provider ?? ""),
  };
}

export async function saveOrderBind(orders, userId) {
  if (!userId || !Array.isArray(orders))
    return false;
  let ok = true;
  for (const raw of orders) {
    const { orderId, playerId, linkId, provider } = parseOrderBindRow(raw);
    if (!orderId || !linkId)
      continue;
    const updated = await sb.updateOrderBind(orderId, userId, linkId, {
      playerId,
      provider,
    });
    if (!updated)
      ok = false;
  }
  return ok;
}

/** [changmen 扩展] 侧栏手动改绑单笔 Link（新→老） */
export async function rebindOrderLink(userId, orderId, toLinkId) {
  return sb.rebindOrderLink(userId, orderId, toLinkId);
}

export function ensureSeed() {}
