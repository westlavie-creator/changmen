import * as sb from "../../../../packages/shared/db/supabase.js";
import { toDateKey, listUserProfitRank } from "./order_store.js";

function accountCount(accounts) {
  return Array.isArray(accounts) ? accounts.length : 0;
}

/** 管理端账号：保留投注相关字段，去掉 token/cookie 等敏感信息 */
export function sanitizeAccountForAdmin(raw) {
  if (!raw || typeof raw !== "object") return null;
  const a = raw;
  const gateway = String(a.gateway ?? a.Gateway ?? "");
  let gatewayHost = "";
  if (gateway) {
    try {
      gatewayHost = new URL(gateway).host;
    } catch {
      gatewayHost = gateway.length > 48 ? `${gateway.slice(0, 45)}…` : gateway;
    }
  }
  const game = a.game && typeof a.game === "object" ? a.game : {};
  return {
    accountId: Number(a.accountId ?? a.AccountId) || 0,
    platform: String(a.platform ?? a.Platform ?? a.Type ?? ""),
    platformId: Number(a.platformId ?? a.PlatformId) || 0,
    platformName: String(a.platformName ?? a.PlatformName ?? ""),
    playerName: String(a.playerName ?? a.PlayerName ?? ""),
    balance: Number(a.balance ?? a.Balance) || 0,
    credit: Number(a.credit ?? a.Credit) || 0,
    currency: String(a.currency ?? a.Currency ?? "CNY"),
    winBalance: Number(a.winBalance ?? a.WinBalance) || 0,
    unsettle: Number(a.unsettle ?? a.Unsettle) || 0,
    proxyId: Number(a.proxyId ?? a.ProxyId) || 0,
    pause: Boolean(a.pause ?? a.Pause),
    markupOnly: Boolean(a.markupOnly ?? a.MarkupOnly),
    noMarkup: Boolean(a.noMarkup ?? a.NoMarkup),
    active: Boolean(a.active ?? a.Active),
    minOdds: Number(a.minOdds ?? a.MinOdds) || 0,
    maxOdds: Number(a.maxOdds ?? a.MaxOdds) || 0,
    minDefault: Number(a.minDefault ?? a.MinDefault) || 0,
    maxDefault: Number(a.maxDefault ?? a.MaxDefault) || 0,
    profit: Number(a.profit ?? a.Profit) || 0,
    maxProfit: Number(a.maxProfit ?? a.MaxProfit) || 0,
    maxBetCount: Number(a.maxBetCount ?? a.MaxBetCount) || 0,
    maxOrder: Number(a.maxOrder ?? a.MaxOrder) || 0,
    todayOrder: Number(a.todayOrder ?? a.TodayOrder) || 0,
    today: Number(a.today ?? a.Today) || 0,
    orderCount: Number(a.orderCount ?? a.OrderCount) || 0,
    totalProfit: Number(a.totalProfit ?? a.TotalProfit) || 0,
    maxBalance: Number(a.maxBalance ?? a.MaxBalance) || 0,
    maxWinBalance: Number(a.maxWinBalance ?? a.MaxWinBalance) || 0,
    description: String(a.description ?? a.Description ?? ""),
    realName: String(a.realName ?? a.RealName ?? ""),
    mobile: String(a.mobile ?? a.Mobile ?? ""),
    multiply: Number(a.multiply ?? a.Multiply) || 1,
    workTimes: Array.isArray(a.workTimes) ? a.workTimes.map(String) : [],
    rateConfig: Array.isArray(a.rateConfig)
      ? a.rateConfig.map((r) => ({
          minOdds: Number(r?.minOdds) || 0,
          maxOdds: Number(r?.maxOdds) || 0,
          rate: Number(r?.rate) || 0,
        }))
      : [],
    game: Object.fromEntries(
      Object.entries(game).map(([name, g]) => [
        name,
        {
          betCount: Number(g?.betCount) || 0,
          profit: Number(g?.profit) || 0,
          odds: Array.isArray(g?.odds) ? g.odds.map(String) : [],
        },
      ]),
    ),
    gatewayHost,
    hasCredentials: Boolean(a.token ?? a.Token ?? a.cookie ?? a.Cookie),
    updateTime: Number(a.updateTime ?? a.UpdateTime) || 0,
  };
}

export function sanitizeSettingForAdmin(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...raw };
}

/** 合并 profiles 三列配置，兼容已迁移库与仍含 setting 的旧行 */
export function profileSettingForAdmin(row) {
  if (!row || typeof row !== "object") return {};
  const legacy = row.setting;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy) && Object.keys(legacy).length) {
    const out = { ...legacy };
    if (typeof out.USERCONFIG === "string") {
      try {
        out.USERCONFIG = JSON.parse(out.USERCONFIG);
      } catch {
        /* keep string */
      }
    }
    if (typeof out.CollectConfig === "string") {
      try {
        out.CollectConfig = JSON.parse(out.CollectConfig);
      } catch {
        /* keep string */
      }
    }
    const betting =
      out.USERCONFIG && typeof out.USERCONFIG === "object" && !Array.isArray(out.USERCONFIG)
        ? out.USERCONFIG
        : {};
    const collect =
      out.CollectConfig && typeof out.CollectConfig === "object" && !Array.isArray(out.CollectConfig)
        ? out.CollectConfig
        : {};
    const { USERCONFIG, CollectConfig, ...prefs } = out;
    return sanitizeSettingForAdmin({
      ...prefs,
      ...betting,
      ...(Object.keys(collect).length ? { CollectConfig: collect } : {}),
    });
  }
  const betting =
    row.betting_config && typeof row.betting_config === "object" && !Array.isArray(row.betting_config)
      ? row.betting_config
      : {};
  const collect =
    row.collect_config && typeof row.collect_config === "object" && !Array.isArray(row.collect_config)
      ? row.collect_config
      : {};
  const prefs =
    row.preferences && typeof row.preferences === "object" && !Array.isArray(row.preferences)
      ? row.preferences
      : {};
  return sanitizeSettingForAdmin({
    ...prefs,
    ...betting,
    ...(Object.keys(collect).length ? { CollectConfig: collect } : {}),
  });
}

function mapAdminUserRow(p, profitByUser) {
  const name = String(p.user_name || "");
  const stats = profitByUser.get(name.toLowerCase());
  const accountsRaw = Array.isArray(p.accounts) ? p.accounts : [];
  const accounts = accountsRaw
    .map(sanitizeAccountForAdmin)
    .filter(Boolean);
  return {
    id: String(p.id),
    userName: name,
    accountCount: accounts.length,
    accounts,
    setting: profileSettingForAdmin(p),
    createdAt: Number(p.created_at) || 0,
    updatedAt: Number(p.updated_at) || 0,
    todayMoney: Number(stats?.Money ?? 0) || 0,
    todayCount: Number(stats?.Count ?? 0) || 0,
    todayBetMoney: Number(stats?.BetMoney ?? 0) || 0,
  };
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
  return (profiles || [])
    .map((p) => mapAdminUserRow(p, profitByUser))
    .sort((a, b) => b.todayMoney - a.todayMoney);
}

export async function getAdminUserDetail(userId, dateKey = toDateKey(Date.now())) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const [profiles, rank] = await Promise.all([
    sb.fetchProfilesAdmin(),
    listUserProfitRank(dateKey),
  ]);
  const profitByUser = new Map(rank.map((r) => [String(r.UserName).toLowerCase(), r]));
  const profile = (profiles || []).find((p) => String(p.id) === id);
  if (!profile) return null;
  return mapAdminUserRow(profile, profitByUser);
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
