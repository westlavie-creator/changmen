import * as sb from "../../../shared/db/supabase.js";
import { toDateKey, listUserProfitRank } from "./order_store.js";

function accountCount(accounts) {
  return Array.isArray(accounts) ? accounts.length : 0;
}

export async function getAdminDashboard(dateKey = toDateKey(Date.now())) {
  const [profiles, rank, orderStats] = await Promise.all([
    sb.fetchProfilesAdmin(),
    listUserProfitRank(dateKey),
    sb.fetchOrdersAdminStats(dateKey),
  ]);
  const profitByUser = new Map(rank.map((r) => [String(r.UserName).toLowerCase(), r]));
  let activeUsersToday = 0;
  for (const p of profiles || []) {
    const name = String(p.user_name || "").toLowerCase();
    if (profitByUser.has(name) && (profitByUser.get(name)?.Count ?? 0) > 0) {
      activeUsersToday += 1;
    }
  }
  return {
    date: dateKey,
    userCount: (profiles || []).length,
    activeUsersToday,
    orderCount: orderStats.count,
    totalMoney: orderStats.money,
    totalBetMoney: orderStats.betMoney,
    topProfit: rank.slice(0, 5),
  };
}

export async function listAdminUsers(dateKey = toDateKey(Date.now())) {
  const [profiles, rank] = await Promise.all([
    sb.fetchProfilesAdmin(),
    listUserProfitRank(dateKey),
  ]);
  const profitByUser = new Map(rank.map((r) => [String(r.UserName).toLowerCase(), r]));
  return (profiles || []).map((p) => {
    const name = String(p.user_name || "");
    const stats = profitByUser.get(name.toLowerCase());
    const accounts = Array.isArray(p.accounts) ? p.accounts : [];
    return {
      id: String(p.id),
      userName: name,
      accountCount: accounts.length,
      accounts: accounts.map((a) => ({
        accountId: a.accountId ?? a.AccountId,
        platform: a.platform ?? a.Platform ?? a.Type,
        playerName: a.playerName ?? a.PlayerName ?? "",
        balance: Number(a.balance ?? a.Balance ?? 0) || 0,
      })),
      createdAt: Number(p.created_at) || 0,
      updatedAt: Number(p.updated_at) || 0,
      todayMoney: Number(stats?.Money ?? 0) || 0,
      todayCount: Number(stats?.Count ?? 0) || 0,
      todayBetMoney: Number(stats?.BetMoney ?? 0) || 0,
    };
  }).sort((a, b) => b.todayMoney - a.todayMoney);
}

export async function listAdminOrders(body = {}) {
  const dateKey = body.date ? String(body.date) : toDateKey(Date.now());
  const pageIndex = Math.max(1, Number(body.pageIndex) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(body.pageSize) || 50));
  const userId = body.userId ? String(body.userId) : "";
  const provider = body.provider ? String(body.provider) : "";
  const { rows, total } = await sb.fetchOrdersAdminPage({
    dateKey,
    userId: userId || undefined,
    provider: provider || undefined,
    pageIndex,
    pageSize,
  });
  const list = (rows || []).map((r) => ({
    id: Number(r.id),
    userId: String(r.user_id),
    playerId: Number(r.player_id) || 0,
    orderId: String(r.order_id || ""),
    provider: String(r.provider || ""),
    match: String(r.match || ""),
    bet: String(r.bet || ""),
    item: String(r.item || ""),
    odds: Number(r.odds) || 0,
    betMoney: Number(r.bet_money) || 0,
    money: Number(r.money) || 0,
    status: String(r.status || ""),
    createAt: Number(r.create_at) || 0,
  }));
  return { date: dateKey, list, total, pageIndex, pageSize };
}
