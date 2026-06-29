import * as sb from "@changmen/db";
import { isAdminUser } from "../../auth/admin_auth.js";
import { resolveVisibleUserIds } from "../../auth/role_filter.js";
import { resolvePolymarketBuilderCode } from "./builder_code.js";
import { fetchAllBuilderTrades } from "./builder_trades.js";
import { isPolymarketRelayerConfigured, getPolymarketRelayerAuthMode } from "./relayer_config.js";

function parseRange(body = {}) {
  if (body.startMs && body.endMs) {
    return {
      startMs: Number(body.startMs),
      endMs: Number(body.endMs),
    };
  }
  if (body.month) {
    const parts = String(body.month).split("-").map(Number);
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || new Date().getMonth() + 1;
    return {
      startMs: new Date(y, m - 1, 1, 0, 0, 0, 0).getTime(),
      endMs: new Date(y, m, 1, 0, 0, 0, 0).getTime(),
    };
  }
  const dk = body.date || new Date().toISOString().slice(0, 10);
  const parts = String(dk).split("-").map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, 0, 0, 0, 0);
  const startMs = d.getTime();
  return { startMs, endMs: startMs + 86400000 };
}

function summarizeChangmenOrders(orders) {
  let totalBet = 0;
  let totalProfit = 0;
  let wins = 0;
  let losses = 0;
  let rejects = 0;
  let pending = 0;
  for (const o of orders) {
    totalBet += Number(o.bet_money) || 0;
    totalProfit += Number(o.money) || 0;
    if (o.status === "Win")
      wins += 1;
    else if (o.status === "Lose")
      losses += 1;
    else if (o.status === "Reject")
      rejects += 1;
    else
      pending += 1;
  }
  return {
    orderCount: orders.length,
    totalBet,
    totalProfit,
    wins,
    losses,
    rejects,
    pending,
  };
}

function mapChangmenOrder(row) {
  let matchTitle = "";
  let betTitle = "";
  try {
    const match = typeof row.match === "string" ? JSON.parse(row.match) : row.match;
    matchTitle = match?.Title || match?.title || "";
  }
  catch { /* ignore */ }
  try {
    const bet = typeof row.bet === "string" ? JSON.parse(row.bet) : row.bet;
    betTitle = bet?.Title || bet?.title || "";
  }
  catch { /* ignore */ }
  return {
    orderId: row.order_id,
    userId: row.user_id,
    userName: row.user_name || "",
    playerId: row.player_id,
    playerName: row.player_name || "",
    status: row.status,
    betMoney: Number(row.bet_money) || 0,
    profit: Number(row.money) || 0,
    message: row.message || "",
    matchTitle,
    betTitle,
    item: row.item || "",
    createAt: Number(row.create_at) || 0,
    updateAt: Number(row.update_at) || 0,
  };
}

/**
 * Builder 看板：Polymarket 归因成交 + changmen Polymarket 订单对照。
 */
export async function getPolymarketBuilderDashboard(body = {}, caller = null) {
  const { startMs, endMs } = parseRange(body);
  const afterSec = Math.floor(startMs / 1000);
  const beforeSec = Math.floor(endMs / 1000);
  const maxPages = Number(body.maxPages) || 5;
  const orderLimit = Math.min(Math.max(Number(body.orderLimit) || 100, 1), 500);

  let userIds;
  if (caller && !isAdminUser(caller)) {
    const allProfiles = await sb.fetchProfilesAdmin();
    const visibleIds = resolveVisibleUserIds(caller, allProfiles);
    if (visibleIds)
      userIds = [...visibleIds];
  }

  const builderCode = resolvePolymarketBuilderCode();
  const [polyResult, changmenRows] = await Promise.all([
    fetchAllBuilderTrades({ afterSec, beforeSec, maxPages }),
    sb.fetchPolymarketOrdersInRange(startMs, endMs, userIds, orderLimit),
  ]);

  const changmenOrders = changmenRows.map(mapChangmenOrder);

  return {
    startMs,
    endMs,
    builderCode,
    relayerConfigured: isPolymarketRelayerConfigured(),
    relayerAuthMode: getPolymarketRelayerAuthMode(),
    polymarket: {
      ...polyResult,
      summary: polyResult.summary,
    },
    changmen: {
      orders: changmenOrders,
      summary: summarizeChangmenOrders(changmenOrders),
    },
  };
}
