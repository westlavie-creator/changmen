/**
 * 足球订单读写。OB 足球写 football_orders；管理端补读统一 orders 内的非 OB 足球。
 */
import * as sb from "@changmen/db";
import {
  parseFootballOrderInput,
  parseFootballOrderStatusPatch,
  publicFootballOrder,
} from "./football_order.js";

function fail(msg) {
  return { ok: false, msg };
}

function ok(info) {
  return { ok: true, info };
}

function sumStake(list) {
  let n = 0;
  for (const row of list)
    n += Number(row.stake) || 0;
  return n;
}

function sumProfit(list) {
  let n = 0;
  for (const row of list) {
    const status = String(row.status || "None");
    if (status === "None" || status === "Pending")
      continue;
    n += Number(row.profit) || 0;
  }
  return n;
}

function isObFootballOrder(row) {
  return String(row?.venue || "OB").trim().toUpperCase() === "OB";
}

function splitMatch(match) {
  const text = String(match || "").trim();
  const parts = text.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2)
    return { home: parts[0].trim(), away: parts.slice(1).join(" vs ").trim() };
  return { home: text, away: "" };
}

function unifiedOrderToFootballOrder(row) {
  if (!row)
    return null;
  const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
    ? row.raw
    : {};
  const { home, away } = splitMatch(row.match);
  return {
    rdsId: Number(row.id) || 0,
    id: String(raw.podClientId || row.order_id || row.id || ""),
    orderId: String(row.order_id || ""),
    at: Number(row.create_at) || 0,
    home,
    away,
    sideLabel: String(row.item || ""),
    marketLabel: String(row.bet || ""),
    odds: Number(row.odds) || 0,
    stake: Number(row.bet_money) || 0,
    oid: String(raw.podOid || raw.pmTokenId || ""),
    obMid: String(raw.podObMid || raw.pmConditionId || ""),
    pmMatchId: String(raw.podPmMatchId || ""),
    auto: raw.podAuto === true,
    venue: String(row.provider || raw.podVenue || ""),
    playerId: Number(row.player_id) || 0,
    accountName: "",
    status: String(row.status || "None"),
    profit: Number(row.money) || 0,
    userId: String(row.user_id || ""),
    userName: String(row.user_name || ""),
  };
}

/**
 * @param {unknown} body
 * @param {{ id: string }} user
 */
export async function saveFootballOrder(body, user) {
  const userId = String(user?.id || "").trim();
  if (!userId)
    return fail("未登录");
  const raw = body?.order ?? body;
  const parsed = parseFootballOrderInput(raw);
  if (parsed) {
    const now = Date.now();
    try {
      const saved = await sb.upsertFootballOrder({
        userId,
        playerId: parsed.playerId,
        venue: parsed.venue,
        venueOrderId: parsed.venueOrderId,
        clientId: parsed.clientId,
        home: parsed.home,
        away: parsed.away,
        sideLabel: parsed.sideLabel,
        marketLabel: parsed.marketLabel,
        odds: parsed.odds,
        stake: parsed.stake,
        oid: parsed.oid,
        obMid: parsed.obMid,
        auto: parsed.auto,
        accountName: parsed.accountName,
        status: parsed.status,
        profit: parsed.profit,
        placedAt: parsed.placedAt,
        createdAt: now,
      });
      const pub = publicFootballOrder(saved);
      if (!pub)
        return fail("写入失败");
      return ok(pub);
    }
    catch (err) {
      return fail(err instanceof Error ? err.message : "保存失败");
    }
  }
  const patch = parseFootballOrderStatusPatch(raw);
  if (!patch)
    return fail("缺少订单");
  try {
    const saved = await sb.patchFootballOrderStatus({
      userId,
      venue: patch.venue,
      venueOrderId: patch.venueOrderId,
      status: patch.status,
      profit: patch.profit,
    });
    const pub = publicFootballOrder(saved);
    if (!pub)
      return fail("未找到场馆单号");
    return ok(pub);
  }
  catch (err) {
    return fail(err instanceof Error ? err.message : "结算回写失败");
  }
}

/**
 * @param {{ id: string }} user
 */
export async function listFootballOrders(user, body = {}) {
  const userId = String(user?.id || "").trim();
  if (!userId)
    return fail("未登录");
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = String(body.date || "").trim() || fallback;
  try {
    const rows = await sb.fetchFootballOrdersByUser(userId, { date, limit: 200 });
    return ok({ date, list: rows.map(publicFootballOrder).filter(Boolean).filter(isObFootballOrder) });
  }
  catch (err) {
    return fail(err instanceof Error ? err.message : "查询失败");
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export async function listAdminFootballOrders(body = {}) {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = String(body.date || "").trim() || fallback;
  const userId = String(body.userId || "").trim();
  const [footballRows, unifiedRows] = await Promise.all([
    sb.fetchFootballOrdersAdmin({
      date,
      userId,
      limit: 2000,
    }),
    sb.fetchUnifiedFootballOrdersAdmin({
      dateKey: date,
      userId,
      limit: 2000,
    }),
  ]);
  const list = [
    ...footballRows.map(publicFootballOrder).filter(Boolean).filter(isObFootballOrder),
    ...unifiedRows.map(unifiedOrderToFootballOrder).filter(Boolean),
  ].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  return {
    date,
    list,
    total: list.length,
    todayStake: sumStake(list),
    todayProfit: sumProfit(list),
  };
}
