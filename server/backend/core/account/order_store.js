import * as sb from "@changmen/db";
import {
  backendBindLinkFromCreateAt,
  placeholderLinkFromCreateAt,
} from "@changmen/db";
import { parseVenueCreateAt } from "@changmen/shared/time/match_time";
import { isAdminUser } from "../auth/admin_auth.js";

export function toDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function parseNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolveStoredLink(link, _orderId, createAt) {
  const n = Number(link);
  if (Number.isFinite(n) && n !== 0)
    return n;
  return placeholderLinkFromCreateAt(createAt);
}

export { resolveStoredLink };

function rowToOrder(r) {
  const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
  return {
    OrderID: r.order_id,
    Link: resolveStoredLink(r.link, r.order_id, r.create_at),
    Type: r.provider || "",
    Match: r.match || "",
    Bet: r.bet || "",
    Item: r.item || "",
    Odds: r.odds || 0,
    BetMoney: r.bet_money || 0,
    Money: r.money || 0,
    Status: r.status || "None",
    CreateAt: r.create_at || 0,
    PlayerID: Number(r.player_id) || 0,
    Player: {
      Platform: r.provider || "",
      UserName: "",
      Status: r.status || "None",
    },
    PmTokenId: raw.pmTokenId ? String(raw.pmTokenId) : undefined,
    PmShares: parseNum(raw.pmShares, 0) || undefined,
    PmStakeUsdc: parseNum(raw.pmStakeUsdc, 0) || undefined,
    PmConditionId: raw.pmConditionId ? String(raw.pmConditionId) : undefined,
    PmOrigin: raw.pmOrigin === "changmen" || raw.pmOrigin === "external"
      ? raw.pmOrigin
      : undefined,
  };
}

export async function listByDate(date, userId) {
  const target = date || toDateKey(Date.now());
  const rows = await sb.fetchOrdersByDate(target, userId);
  return rows.map(rowToOrder);
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
  const existing = await sb.fetchOrdersByPlayerAll(playerId, userId);
  const linkByOrderId = new Map(
    existing.map(r => [String(r.order_id), Number(r.link) || 0]),
  );
  const existingByOrderId = new Map(
    existing.map(r => [String(r.order_id), r]),
  );

  const rows = orders.map((o) => {
    const rawCreate = o.createAt ?? o.CreateAt;
    const parsed = parseVenueCreateAt(rawCreate, 0);
    const orderId = String(o.orderId || `${playerId}-${parsed || Date.now()}`);
    const prevAt = Number(existingByOrderId.get(orderId)?.create_at) || 0;
    const createAt = parsed > 0 ? parsed : prevAt > 0 ? prevAt : Date.now();
    const boundLink = linkByOrderId.get(orderId);
    const link
      = boundLink != null && boundLink !== 0
        ? boundLink
        : backendBindLinkFromCreateAt(createAt);
    const prevRow = existingByOrderId.get(orderId);
    const prevRaw = prevRow?.raw && typeof prevRow.raw === "object" && !Array.isArray(prevRow.raw)
      ? prevRow.raw
      : {};
    const provider = o.provider || o.Type || defaultProvider || "";
    const incomingOrigin = o.pmOrigin;
    const prevOrigin = prevRaw.pmOrigin;
    let pmOrigin = incomingOrigin;
    if (prevOrigin === "changmen" && incomingOrigin === "external")
      pmOrigin = "changmen";
    else if (!pmOrigin)
      pmOrigin = prevOrigin || (provider === "Polymarket" ? "external" : undefined);
    const raw = pmOrigin ? { ...o, pmOrigin } : o;
    return {
      user_id: String(userId),
      player_id: Number(playerId),
      order_id: orderId,
      link,
      provider,
      match: o.match || o.Match || "",
      bet: o.bet || o.Bet || "",
      item: o.item || o.Item || "",
      odds: parseNum(o.odds, 0),
      bet_money: parseNum(o.betMoney || o.BetMoney, 0),
      money: parseNum(o.money || o.Money, 0),
      status: mapStatus(o.status || o.Status),
      create_at: createAt,
      raw,
    };
  });
  return sb.upsertOrders(rows);
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
    row.betMoney += Number(o.bet_money) || 0;
    row.count += 1;
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

export function ensureSeed() {}
