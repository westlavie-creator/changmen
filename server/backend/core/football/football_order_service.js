/**
 * 足球订单读写。不走电竞账号订单服务。
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
    return ok({ date, list: rows.map(publicFootballOrder).filter(Boolean) });
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
  const rows = await sb.fetchFootballOrdersAdmin({
    date,
    userId,
    limit: 2000,
  });
  const list = rows.map(publicFootballOrder).filter(Boolean);
  return {
    date,
    list,
    total: list.length,
    todayStake: sumStake(list),
    todayProfit: sumProfit(list),
  };
}
