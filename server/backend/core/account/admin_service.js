import crypto from "node:crypto";
import * as sb from "@changmen/db";
import { ensurePgPoolReady, getPgPool, insertProfile } from "@changmen/db";
import { accountProviderKey, resolveAccountMultiply } from "@changmen/shared/account_multiply";
import { resolveAccountCurrency } from "@changmen/shared/currency";
import { lookupOrderLogs, toAdminOrderLogPayload } from "../admin_tools/user_log_lookup.js";
import { isAdminUser } from "../auth/admin_auth.js";
import { filterProfiles, getVisibleUserIds, resolveVisibleUserIds } from "../auth/role_filter.js";
import { listProfileRows, loadAccountsForUser, loadProfileById } from "../db/store.js";
import { enrichOrdersBelongingToDate, listUserProfitRank, resolveStoredLink, rowToOrder, toDateKey } from "./order_store.js";
import * as orderStore from "./order_store.js";
import { summarizePfOrders } from "../integrations/predictfun/pf_ledger.js";
import {
  lastLoginFieldsFromProfile,
  PROFILE_META_PREFERENCE_KEYS,
} from "./user_login_meta.js";
import { resolvePresenceState } from "./user_presence.js";
import store from "../esport-api/store.js";
import { parseFormBool } from "../shared/parse_form_bool.js";
import * as accountStore from "./account_store.js";

export { parseFormBool } from "../shared/parse_form_bool.js";

function accountCount(accounts) {
  return Array.isArray(accounts) ? accounts.length : 0;
}

/** 管理端账号：含 gateway/token/referer 等完整凭证（仅 Client_Admin* 接口，需 is_admin） */
export function sanitizeAccountForAdmin(raw) {
  if (!raw || typeof raw !== "object")
    return null;
  const a = raw;
  const gateway = String(a.gateway ?? a.Gateway ?? "");
  let gatewayHost = "";
  if (gateway) {
    try {
      gatewayHost = new URL(gateway).host;
    }
    catch {
      gatewayHost = gateway.length > 48 ? `${gateway.slice(0, 45)}…` : gateway;
    }
  }
  const game = a.game && typeof a.game === "object" ? a.game : {};
  return {
    accountId: Number(a.accountId ?? a.AccountId) || 0,
    platform: String(a.provider ?? a.Provider ?? a.platform ?? a.Platform ?? a.Type ?? ""),
    platformId: Number(a.platformId ?? a.PlatformId) || 0,
    platformName: String(a.platformName ?? a.PlatformName ?? ""),
    playerName: String(a.playerName ?? a.PlayerName ?? ""),
    balance: Number(a.balance ?? a.Balance) || 0,
    credit: Number(a.credit ?? a.Credit) || 0,
    currency: resolveAccountCurrency(
      a.provider ?? a.Provider ?? a.platform ?? a.Platform,
      a.currency ?? a.Currency,
    ),
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
    city: String(a.city ?? a.City ?? ""),
    gateway: gateway || undefined,
    token: a.token ?? a.Token ? String(a.token ?? a.Token) : undefined,
    referer: a.referer ?? a.Referer ? String(a.referer ?? a.Referer) : undefined,
    userAgent: a.userAgent ?? a.UserAgent ? String(a.userAgent ?? a.UserAgent) : undefined,
    cookie: a.cookie ?? a.Cookie ? String(a.cookie ?? a.Cookie) : undefined,
    maxBalanceOdds: Number(a.maxBalanceOdds ?? a.MaxBalanceOdds) || 2,
    lastOdds: Boolean(a.lastOdds ?? a.LastOdds),
    multiply: resolveAccountMultiply(
      a.provider ?? a.Provider ?? a.platform ?? a.Platform,
      a.multiply ?? a.Multiply,
    ),
    workTimes: Array.isArray(a.workTimes) ? a.workTimes.map(String) : [],
    rateConfig: Array.isArray(a.rateConfig)
      ? a.rateConfig.map(r => ({
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
    venueMemberId: (() => {
      const v = a.venueMemberId ?? a.venueId;
      return v != null && String(v).trim() ? String(v).trim() : undefined;
    })(),
    venueAccountName: a.venueAccountName != null && String(a.venueAccountName).trim()
      ? String(a.venueAccountName).trim()
      : undefined,
  };
}

export function sanitizeSettingForAdmin(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return {};
  return { ...raw };
}

/** 合并 profiles 三列配置，兼容已迁移库与仍含 setting 的旧行 */
export function profileSettingForAdmin(row) {
  if (!row || typeof row !== "object")
    return {};
  const legacy = row.setting;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy) && Object.keys(legacy).length) {
    const out = { ...legacy };
    if (typeof out.USERCONFIG === "string") {
      try {
        out.USERCONFIG = JSON.parse(out.USERCONFIG);
      }
      catch {
        /* keep string */
      }
    }
    if (typeof out.CollectConfig === "string") {
      try {
        out.CollectConfig = JSON.parse(out.CollectConfig);
      }
      catch {
        /* keep string */
      }
    }
    const betting
      = out.USERCONFIG && typeof out.USERCONFIG === "object" && !Array.isArray(out.USERCONFIG)
        ? out.USERCONFIG
        : {};
    const collect
      = out.CollectConfig && typeof out.CollectConfig === "object" && !Array.isArray(out.CollectConfig)
        ? out.CollectConfig
        : {};
    const { USERCONFIG, CollectConfig, ...prefs } = out;
    const prefsForAdmin = Object.fromEntries(
      Object.entries(prefs).filter(([k]) => !PROFILE_META_PREFERENCE_KEYS.has(k)),
    );
    return normalizeAdminSettingFlags(sanitizeSettingForAdmin({
      ...prefsForAdmin,
      ...betting,
      ...(Object.keys(collect).length ? { CollectConfig: collect } : {}),
      ...(row.betting_config && typeof row.betting_config === "object" && !Array.isArray(row.betting_config)
        ? row.betting_config
        : {}),
    }));
  }
  const betting
    = row.betting_config && typeof row.betting_config === "object" && !Array.isArray(row.betting_config)
      ? row.betting_config
      : {};
  const collect
    = row.collect_config && typeof row.collect_config === "object" && !Array.isArray(row.collect_config)
      ? row.collect_config
      : {};
  const prefs
    = row.preferences && typeof row.preferences === "object" && !Array.isArray(row.preferences)
      ? row.preferences
      : {};
  const prefsForAdmin = Object.fromEntries(
    Object.entries(prefs).filter(([k]) => !PROFILE_META_PREFERENCE_KEYS.has(k)),
  );
  return normalizeAdminSettingFlags(sanitizeSettingForAdmin({
    ...prefsForAdmin,
    ...betting,
    ...(Object.keys(collect).length ? { CollectConfig: collect } : {}),
  }));
}

function normalizeAdminSettingFlags(setting) {
  if (!setting || typeof setting !== "object" || Array.isArray(setting))
    return setting;
  const out = { ...setting };
  if ("BetTarget" in out)
    out.BetTarget = parseFormBool(out.BetTarget);
  return out;
}

function resolveBettingState(p) {
  const setting = profileSettingForAdmin(p);
  const betting = Boolean(setting.betting);
  const autoOpen = Boolean(setting.bettingAutoOpen);
  const autoOpenTime = Number(setting.bettingAutoOpenTime) || 0;
  const scheduled = !betting && autoOpen && autoOpenTime > Date.now();
  const betMoney = Number(setting.betMoney) || 0;
  return {
    bettingEnabled: betting ? 1 : 0,
    bettingScheduled: scheduled ? 1 : 0,
    bettingAutoOpenTime: autoOpenTime,
    betMoney,
  };
}

function mapAdminUserRow(p, profitByUser = new Map()) {
  const name = String(p.user_name || "");
  const stats = profitByUser.get(name.toLowerCase());
  const id = String(p.id);
  const accounts = store.getAccountsForUser(id)
    .map(sanitizeAccountForAdmin)
    .filter(Boolean);
  const presence = resolvePresenceState(id, p);
  const bettingState = resolveBettingState(p);
  return {
    id,
    userName: name,
    isAdmin: Boolean(p.is_admin),
    role: p.role || (p.is_admin ? "admin" : "user"),
    teamId: p.team_id || null,
    isOnline: presence.isOnline,
    lastActiveAt: presence.lastActiveAt,
    ...bettingState,
    ...lastLoginFieldsFromProfile(p),
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

export async function getAdminDashboard(dateKey = toDateKey(Date.now()), caller = null) {
  const [allProfiles, rank, orderStats] = await Promise.all([
    sb.fetchProfilesAdmin(),
    listUserProfitRank(dateKey),
    sb.fetchOrdersAdminStats(dateKey),
  ]);
  const visibleIds = resolveVisibleUserIds(caller, allProfiles);
  const profiles = filterProfiles(allProfiles, visibleIds);
  const profitByUser = new Map(
    (Array.isArray(rank) ? rank : []).map(r => [String(r.UserName).toLowerCase(), r]),
  );
  let activeUsersToday = 0;
  let totalMoney = 0;
  let totalBetMoney = 0;
  let orderCount = 0;
  for (const p of profiles) {
    const name = String(p.user_name || "").toLowerCase();
    const stats = profitByUser.get(name);
    if (stats && (stats.Count ?? 0) > 0) {
      activeUsersToday += 1;
      totalMoney += Number(stats.Money ?? 0) || 0;
      totalBetMoney += Number(stats.BetMoney ?? 0) || 0;
      orderCount += Number(stats.Count ?? 0) || 0;
    }
  }
  const visibleNames = visibleIds
    ? new Set(profiles.map(p => String(p.user_name || "").toLowerCase()))
    : null;
  const topProfit = (Array.isArray(rank) ? rank : [])
    .filter(r => !visibleNames || visibleNames.has(String(r.UserName).toLowerCase()))
    .slice(0, 5);
  return {
    date: dateKey,
    userCount: profiles.length,
    activeUsersToday,
    orderCount: visibleIds ? orderCount : orderStats.count,
    totalMoney: visibleIds ? totalMoney : orderStats.money,
    totalBetMoney: visibleIds ? totalBetMoney : orderStats.betMoney,
    topProfit,
  };
}

export async function listAdminUsers(dateKey = toDateKey(Date.now()), caller = null) {
  const [allProfiles, rank] = await Promise.all([
    sb.fetchProfilesAdmin(),
    listUserProfitRank(dateKey),
  ]);
  const visibleIds = resolveVisibleUserIds(caller, allProfiles);
  const profiles = filterProfiles(allProfiles, visibleIds);
  const profitByUser = new Map(
    (Array.isArray(rank) ? rank : []).map(r => [String(r.UserName).toLowerCase(), r]),
  );
  return profiles
    .map(p => mapAdminUserRow(p, profitByUser))
    .sort((a, b) => b.todayMoney - a.todayMoney);
}

export async function getAdminUserDetail(userId, dateKey = toDateKey(Date.now())) {
  const id = String(userId || "").trim();
  if (!id)
    return null;
  const [profiles, rank] = await Promise.all([
    sb.fetchProfilesAdmin(),
    listUserProfitRank(dateKey),
  ]);
  const profitByUser = new Map(
    (Array.isArray(rank) ? rank : []).map(r => [String(r.UserName).toLowerCase(), r]),
  );
  const profile = (profiles || []).find(p => String(p.id) === id);
  if (!profile)
    return null;
  return mapAdminUserRow(profile, profitByUser);
}

function stripOrderHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function orderMatchColumn(r) {
  const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
  const matchId = Number(raw.matchId ?? raw.MatchId ?? raw.match_id ?? 0) || 0;
  const title = stripOrderHtml(r.match || raw.match || "");
  const key = matchId > 0 ? `id:${matchId}` : title ? `t:${title}` : `o:${r.id}`;
  return {
    key,
    matchId,
    label: title || (matchId > 0 ? `比赛 #${matchId}` : "—"),
    raw,
  };
}

function buildClientMatchStartIndex(clientMatches) {
  const byId = new Map();
  const byTitle = new Map();
  const list = Array.isArray(clientMatches) ? clientMatches : [];
  for (const m of list) {
    const id = Number(m.id ?? m.ID) || 0;
    const startTime = Number(m.start_time ?? m.StartTime) || 0;
    if (!startTime)
      continue;
    if (id)
      byId.set(id, startTime);
    const title = stripOrderHtml(m.title ?? m.Title ?? "");
    if (title && !byTitle.has(title))
      byTitle.set(title, startTime);
  }
  return { byId, byTitle };
}

function resolveMatchStartTime(col, startIndex) {
  const raw = col.raw || {};
  const fromRaw = Number(
    raw.startTime ?? raw.StartTime ?? raw.start_time ?? raw.matchStartTime ?? 0,
  ) || 0;
  if (fromRaw)
    return fromRaw;
  if (!startIndex)
    return 0;
  const byId = startIndex.byId instanceof Map ? startIndex.byId : null;
  const byTitle = startIndex.byTitle instanceof Map ? startIndex.byTitle : null;
  if (col.matchId && byId?.has(col.matchId)) {
    return byId.get(col.matchId);
  }
  if (col.label && byTitle?.has(col.label)) {
    return byTitle.get(col.label);
  }
  return 0;
}

function mapAdminOrderRow(r, startIndex = null) {
  const col = orderMatchColumn(r);
  const safeStartIndex
    = startIndex
      && typeof startIndex === "object"
      && !Array.isArray(startIndex)
      && (startIndex.byId instanceof Map || startIndex.byTitle instanceof Map)
      ? startIndex
      : null;
  // 与工作台 rowToOrder 同源：卖单 Money 重算 + raw 内 Pm* 字段
  const o = rowToOrder(r);
  return {
    id: Number(r.id),
    userId: String(r.user_id),
    playerId: Number(o.PlayerID) || 0,
    orderId: String(o.OrderID || ""),
    linkId: Number(o.Link) || resolveStoredLink(r.link, r.order_id, r.create_at),
    provider: String(o.Type || ""),
    match: stripOrderHtml(o.Match || ""),
    bet: String(o.Bet || ""),
    item: String(o.Item || ""),
    odds: Number(o.Odds) || 0,
    betMoney: Number(o.BetMoney) || 0,
    money: Number(o.Money) || 0,
    status: String(o.Status || ""),
    createAt: Number(o.CreateAt) || 0,
    matchId: col.matchId,
    matchKey: col.key,
    matchLabel: col.label,
    matchStartTime: resolveMatchStartTime(col, safeStartIndex),
    pmTokenId: o.PmTokenId,
    pmShares: o.PmShares,
    pmFillPrice: o.PmFillPrice,
    pmStakeUsdc: o.PmStakeUsdc,
    pmConditionId: o.PmConditionId,
    pmOrigin: o.PmOrigin,
    pmAttributedSellShares: o.PmAttributedSellShares,
    pmRealizedPnlUsdc: o.PmRealizedPnlUsdc,
    pmSellProceeds: o.PmSellProceeds,
    pmLastSellOrderId: o.PmLastSellOrderId,
    pmSellState: o.PmSellState,
    pmSide: o.PmSide,
    pmBuyOrderId: o.PmBuyOrderId,
    pfSide: o.PfSide,
    pfBuyOrderId: o.PfBuyOrderId,
    pfSellState: o.PfSellState,
    pfShares: o.PfShares,
    pfHoldShares: o.PfHoldShares,
    pfNotionalUsdt: o.PfNotionalUsdt,
    pfFillCostUsdt: o.PfFillCostUsdt,
    pfBookPrice: o.PfBookPrice,
    pfTokenId: o.PfTokenId,
    pfMarketId: o.PfMarketId,
    pfSellOrderId: o.PfSellOrderId,
    pfSellProceeds: o.PfSellProceeds,
    pfFeeAmountWei: o.PfFeeAmountWei,
    pfFeeType: o.PfFeeType,
    pfFeeUsdt: o.PfFeeUsdt,
    pfFeeRateBps: o.PfFeeRateBps,
  };
}

export async function listAdminOrders(body = {}, caller = null) {
  const dateKey = body.date ? String(body.date) : toDateKey(Date.now());
  const pageIndex = Math.max(1, Number(body.pageIndex) || 1);
  // 与矩阵视图 fetchOrdersAdminAll 同量级；前端 getAdminOrdersAll 一次拉全日
  const pageSize = Math.min(5000, Math.max(1, Number(body.pageSize) || 50));
  const userId = body.userId ? String(body.userId) : "";
  const provider = body.provider ? String(body.provider) : "";
  const playerIdRaw = Number(body.playerId ?? body.player_id ?? 0);
  const playerId = Number.isFinite(playerIdRaw) && playerIdRaw > 0 ? playerIdRaw : undefined;

  let userIds;
  if (caller && !isAdminUser(caller)) {
    const allProfiles = await sb.fetchProfilesAdmin();
    const visibleIds = resolveVisibleUserIds(caller, allProfiles);
    if (visibleIds) {
      if (userId && !visibleIds.has(userId)) {
        return { date: dateKey, list: [], total: 0, pageIndex, pageSize, hasMore: false };
      }
      userIds = [...visibleIds];
    }
  }

  const filter = {
    dateKey,
    userId: userId || undefined,
    provider: provider || undefined,
    playerId,
    userIds,
  };
  const { rows, total } = await sb.fetchOrdersAdminPage({ ...filter, pageIndex, pageSize });
  const enriched = await enrichOrdersBelongingToDate(rows || [], dateKey, {
    userId: userId || undefined,
    userIds,
  });
  const list = enriched.map(r => mapAdminOrderRow(r));
  const sqlTotal = Number(total) || 0;
  // total/hasMore 按 SQL create_at 当日分页；list 经 enrich 后可含跨日 sibling / 整页被滤空
  return {
    date: dateKey,
    list,
    total: sqlTotal,
    pageIndex,
    pageSize,
    hasMore: pageIndex * pageSize < sqlTotal,
  };
}

/** Client_AdminDeleteOrders：form body 里 orderIds 常为 JSON.stringify 后的数组字符串 */
export function parseAdminOrderIdList(raw) {
  if (raw == null || raw === "")
    return [];
  if (Array.isArray(raw))
    return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed)
      return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed))
          return parsed;
      }
      catch {
        // fall through
      }
    }
    return [trimmed];
  }
  return [raw];
}

/** 管理端：按主键 id 删除订单（可批量，如同 Link 套利组） */
export async function deleteAdminOrders(body = {}, caller = null) {
  if (caller && !isAdminUser(caller))
    throw new Error("仅管理员可删除订单");
  const raw = body.orderIds ?? body.ids ?? body.id;
  const ids = parseAdminOrderIdList(raw);
  const deleted = await sb.deleteOrdersByIds(ids);
  if (!deleted)
    throw new Error("删除失败或订单不存在");
  return { deleted };
}

/** 管理端：当日全量订单（对阵矩阵视图） */
export async function listAdminOrdersMatrix(body = {}, caller = null) {
  const dateKey = body.date ? String(body.date) : toDateKey(Date.now());
  const provider = body.provider ? String(body.provider) : "";

  let userIds;
  if (caller && !isAdminUser(caller)) {
    const allProfiles = await sb.fetchProfilesAdmin();
    const visibleIds = resolveVisibleUserIds(caller, allProfiles);
    if (visibleIds)
      userIds = [...visibleIds];
  }

  const filter = {
    dateKey,
    provider: provider || undefined,
    userIds,
  };
  const [rows, clientMatches] = await Promise.all([
    sb.fetchOrdersAdminAll(filter),
    sb.fetchClientMatches(),
  ]);
  const enriched = await enrichOrdersBelongingToDate(rows || [], dateKey, { userIds });
  const startIndex = buildClientMatchStartIndex(clientMatches);
  const list = enriched.map(r => mapAdminOrderRow(r, startIndex));
  return { date: dateKey, list, total: list.length };
}

/** 管理端：Link / order_id 关联 Client_SaveUserLog 诊断 */
export async function listAdminOrderLogs(body = {}, caller = null) {
  const userId = String(body.userId ?? body.user_id ?? "").trim();
  const linkRaw = body.linkId ?? body.link ?? body.LinkID;
  const orderId = body.orderId ?? body.order_id ?? body.OrderID;
  if (!userId)
    throw new Error("缺少 userId");
  if (caller && !isAdminUser(caller)) {
    const visibleIds = await getVisibleUserIds(caller);
    if (visibleIds && !visibleIds.has(userId))
      throw new Error("无权查看该用户的日志");
  }
  if (linkRaw == null && !orderId)
    throw new Error("请指定 linkId 或 orderId");

  const result = await lookupOrderLogs({
    userId,
    link: linkRaw ?? undefined,
    orderId: orderId ? String(orderId) : undefined,
    paddingMs: body.paddingMs,
    logLimit: body.logLimit,
  });
  const payload = toAdminOrderLogPayload(result);
  if (!payload.ok)
    throw new Error(payload.error || "查询失败");
  return payload;
}

function validateNewPassword(password) {
  const pwd = String(password || "");
  if (pwd.length < 6)
    throw new Error("密码至少 6 位");
  return pwd;
}

function validateUserName(userName) {
  const name = String(userName || "").trim();
  if (!name)
    throw new Error("用户名必填");
  if (!/^[\w\u4E00-\u9FA5]+$/.test(name)) {
    throw new Error("用户名仅支持字母、数字、下划线或中文");
  }
  return name;
}

/** 管理端创建登录用户（RDS users + profiles） */
export async function createAdminUser(userName, password) {
  const name = validateUserName(userName);
  const pwd = validateNewPassword(password);
  const now = Date.now();

  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool)
    throw new Error("RDS 未配置，无法创建用户");
  const existing = await pool.query(
    "SELECT id FROM users WHERE lower(user_name) = lower($1)",
    [name],
  );
  if (existing.rows.length)
    throw new Error("用户名已存在");
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, user_name, password_hash, metadata, created_at, updated_at)
     VALUES ($1, $2, crypt($3, gen_salt('bf')), '{}', $4, $4)`,
    [userId, name, pwd, now],
  );
  const ok = await insertProfile(userId, {
    id: userId,
    user_name: name,
    accounts: [],
    betting_config: {},
    collect_config: {},
    preferences: {},
    created_at: now,
    updated_at: now,
  });
  if (!ok)
    throw new Error("profiles 创建失败");
  return { id: userId, userName: name };
}

/** 管理端删除用户（profiles ON DELETE CASCADE 自动级联） */
export async function deleteAdminUser(userId, operatorUserId) {
  const id = String(userId || "").trim();
  if (!id)
    throw new Error("用户 ID 无效");
  if (id === String(operatorUserId || "").trim()) {
    throw new Error("不能删除当前登录账号");
  }
  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool)
    throw new Error("RDS 未配置");
  const { rows } = await pool.query("SELECT user_name, is_admin FROM users WHERE id = $1", [id]);
  if (!rows[0])
    throw new Error("用户不存在");
  if (rows[0].is_admin) {
    const { rows: admins } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true",
    );
    if ((admins[0]?.n ?? 0) <= 1)
      throw new Error("至少保留一名管理员");
  }
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  return { id, userName: String(rows[0].user_name) };
}

/** 管理端更改登录用户名 */
export async function renameAdminUser(userId, userName, caller = null) {
  const id = String(userId || "").trim();
  if (!id)
    throw new Error("用户 ID 无效");
  if (caller && !isAdminUser(caller))
    throw new Error("仅管理员可更改用户名");
  const name = validateUserName(userName);

  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool)
    throw new Error("RDS 未配置");

  const { rows } = await pool.query(
    "SELECT user_name FROM users WHERE id = $1",
    [id],
  );
  if (!rows[0])
    throw new Error("用户不存在");
  const current = String(rows[0].user_name || "");
  if (current.toLowerCase() === name.toLowerCase()) {
    if (current === name)
      return { id, userName: name };
    const ok = await sb.updateUserName(id, name);
    if (!ok)
      throw new Error("更新用户名失败");
    await loadProfileById(id);
    return { id, userName: name };
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE lower(user_name) = lower($1) AND id <> $2",
    [name, id],
  );
  if (existing.rows.length)
    throw new Error("用户名已存在");

  const ok = await sb.updateUserName(id, name);
  if (!ok)
    throw new Error("更新用户名失败");
  await loadProfileById(id);
  return { id, userName: name };
}

/** 管理端重置用户登录密码 */
export async function resetAdminUserPassword(userId, password, caller = null) {
  const id = String(userId || "").trim();
  if (!id)
    throw new Error("用户 ID 无效");
  if (caller && !isAdminUser(caller)) {
    const visibleIds = await getVisibleUserIds(caller);
    if (visibleIds && !visibleIds.has(id))
      throw new Error("无权操作该用户");
  }
  const pwd = validateNewPassword(password);
  const now = Date.now();

  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool)
    throw new Error("RDS 未配置");
  const { rows } = await pool.query(
    "SELECT user_name FROM users WHERE id = $1",
    [id],
  );
  if (!rows[0])
    throw new Error("用户不存在");
  await pool.query(
    `UPDATE users SET password_hash = crypt($2, gen_salt('bf')), updated_at = $3 WHERE id = $1`,
    [id, pwd, now],
  );
  return { id, userName: String(rows[0].user_name) };
}

async function writeProfilePreferencesAwait(uid, preferences) {
  const id = String(uid);
  const now = Date.now();
  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool)
    throw new Error("RDS 未配置");
  const { rowCount } = await pool.query(
    `UPDATE profiles SET preferences = $2::jsonb, updated_at = $3 WHERE id = $1`,
    [id, JSON.stringify(preferences || {}), now],
  );
  if (!rowCount)
    throw new Error("用户不存在");
}

/** 操盘 Tab：远程 query 失败时，管理端从 RDS 读取账号快照（对齐 TradeRemoteAccount 形状） */
function mapAccountForTrade(raw) {
  const row = sanitizeAccountForAdmin(raw);
  if (!row?.accountId)
    return null;
  return {
    accountId: row.accountId,
    platformName: row.platformName,
    platformId: row.platformId,
    playerName: row.playerName,
    provider: row.platform,
    balance: row.balance,
    pause: row.pause,
    lastOdds: row.lastOdds,
    profit: row.profit,
    maxBetCount: row.maxBetCount,
    minOdds: row.minOdds,
    maxOdds: row.maxOdds,
    multiply: row.multiply,
  };
}

export async function getAdminUserTradeAccounts(userId, provider, caller = null) {
  const uid = String(userId || "").trim();
  if (!uid)
    throw new Error("用户 ID 无效");
  if (caller && !isAdminUser(caller)) {
    const visibleIds = await getVisibleUserIds(caller);
    if (visibleIds && !visibleIds.has(uid))
      throw new Error("无权查看该用户");
  }
  await loadProfileById(uid);
  const platform = String(provider || "").trim();
  return store.getAccountsForUser(uid)
    .map(mapAccountForTrade)
    .filter(Boolean)
    .filter(row => !platform || row.provider === platform);
}

/** 管理端子账号列表（按可见用户从 RDS 回源） */
export async function listAdminAccounts(caller = null) {
  const allProfiles = await sb.fetchProfilesAdmin();
  const visibleIds = resolveVisibleUserIds(caller, allProfiles);
  const profiles = filterProfiles(allProfiles, visibleIds);
  const out = [];
  await Promise.all((profiles || []).map(async (p) => {
    const id = String(p.id);
    await loadAccountsForUser(id);
    const accounts = store.getAccountsForUser(id);
    for (const raw of accounts) {
      const detail = sanitizeAccountForAdmin(raw);
      if (!detail)
        continue;
      if (String(detail.platform || detail.provider || "") === "PredictFun" && detail.accountId) {
        try {
          const orders = await orderStore.listByPlayer(detail.accountId, id);
          const stats = summarizePfOrders(orders);
          // 余额以 total_balance（detail.balance）为准；credit 对 PF 无意义
          detail.credit = 0;
          detail.totalProfit = stats.settledPnl;
          detail.unsettle = stats.unsettle;
        }
        catch {
          detail.credit = 0;
        }
      }
      out.push({
        userId: id,
        userName: String(p.user_name || ""),
        teamId: p.team_id || null,
        ...detail,
      });
    }
  }));
  out.sort((a, b) => {
    const u = String(a.userName).localeCompare(String(b.userName), "zh");
    if (u)
      return u;
    const p = String(a.platform).localeCompare(String(b.platform));
    if (p)
      return p;
    return Number(a.accountId) - Number(b.accountId);
  });
  return out;
}

function findPredictFunAccount(accounts) {
  return (accounts || []).find((a) => {
    const provider = String(a.provider ?? a.Provider ?? a.platform ?? "").trim();
    return provider === "PredictFun";
  }) || null;
}

/** PredictFun changmen 会员列表（每用户至多一条 PF house 子账号） */
export async function listAdminPredictFunMembers(caller = null) {
  if (caller && !isAdminUser(caller))
    throw new Error("无管理员权限");
  const allProfiles = await sb.fetchProfilesAdmin();
  const visibleIds = resolveVisibleUserIds(caller, allProfiles);
  const profiles = filterProfiles(allProfiles, visibleIds);
  const out = [];
  await Promise.all((profiles || []).map(async (p) => {
    const id = String(p.id);
    const userName = String(p.user_name || "");
    await loadAccountsForUser(id);
    const accounts = store.getAccountsForUser(id);
    const pf = findPredictFunAccount(accounts);
    const detail = pf ? sanitizeAccountForAdmin(pf) : null;
    let balance = Number(detail?.balance) || 0;
    let totalProfit = 0;
    if (detail?.accountId) {
      // 历史：余额误写在 credit
      const legacyCredit = Number(detail.credit) || 0;
      if (balance === 0 && legacyCredit > 0)
        balance = legacyCredit;
      try {
        const orders = await orderStore.listByPlayer(detail.accountId, id);
        totalProfit = summarizePfOrders(orders).settledPnl;
      }
      catch {
        totalProfit = Number(detail?.totalProfit) || 0;
      }
    }
    out.push({
      userId: id,
      userName,
      teamId: p.team_id || null,
      memberName: detail?.playerName || userName || id.slice(0, 8),
      hasAccount: Boolean(detail?.accountId),
      accountId: detail?.accountId || 0,
      balance,
      maxBalance: detail?.maxBalance ?? 0,
      multiply: detail?.multiply ?? 1,
      pause: Boolean(detail?.pause),
      today: detail?.today ?? 0,
      totalProfit,
      description: detail?.description || "",
      currency: detail?.currency || "USDT",
      updateTime: detail?.updateTime || 0,
      account: detail,
    });
  }));
  out.sort((a, b) => {
    if (a.hasAccount !== b.hasAccount)
      return a.hasAccount ? -1 : 1;
    return String(a.userName).localeCompare(String(b.userName), "zh");
  });
  return out;
}

/**
 * 管理端为用户确保 PredictFun house 会员账号：
 * - playerName = 登录名；token = { mode: "house" }
 * - 先 RDS 回源账号列表再合并，避免空缓存覆盖
 */
export async function ensurePredictFunHouseAccount(userId, caller = null) {
  const uid = String(userId || "").trim();
  if (!uid)
    throw new Error("用户 ID 无效");
  if (!caller || !isAdminUser(caller))
    throw new Error("无管理员权限");

  await loadProfileById(uid);
  const profile = listProfileRows().find(p => String(p.id) === uid);
  if (!profile)
    throw new Error("用户不存在");

  const playerName = String(profile.user_name || "").trim() || uid.slice(0, 8);
  await loadAccountsForUser(uid);
  const accounts = [...store.getAccountsForUser(uid)];
  const existing = findPredictFunAccount(accounts);
  if (existing) {
    const token = String(existing.token ?? "").trim();
    let needPatch = false;
    if (!token || !/"mode"\s*:\s*"house"/i.test(token)) {
      existing.token = JSON.stringify({ mode: "house" });
      needPatch = true;
    }
    if (String(existing.provider || "") !== "PredictFun") {
      existing.provider = "PredictFun";
      needPatch = true;
    }
    if (String(existing.playerName || "").trim() !== playerName) {
      existing.playerName = playerName;
      needPatch = true;
    }
    if (needPatch)
      await store.setAccountsForUser(uid, accounts);
    return {
      created: false,
      account: sanitizeAccountForAdmin(existing),
    };
  }

  const created = await accountStore.createTagPlatform(
    "PredictFun",
    playerName,
    uid,
    { provider: "PredictFun" },
  );
  if (!created?.playerId)
    throw new Error("CreateTagPlatform 失败");

  const aid = Number(created.playerId);
  const byId = accounts.find(a => Number(a.accountId ?? a.AccountId) === aid);
  if (byId) {
    byId.token = JSON.stringify({ mode: "house" });
    byId.provider = "PredictFun";
    byId.playerName = String(created.playerName || playerName);
    await store.setAccountsForUser(uid, accounts);
    return { created: false, account: sanitizeAccountForAdmin(byId) };
  }

  const houseRow = {
    accountId: aid,
    platformId: Number(created.platformId) || 0,
    platformName: "PredictFun",
    playerName: String(created.playerName || playerName),
    provider: "PredictFun",
    token: JSON.stringify({ mode: "house" }),
    gateway: "",
    referer: "",
    userAgent: "",
    cookie: "",
    proxyId: 0,
    balance: 0,
    credit: 0,
    currency: "USDT",
    pause: false,
    active: true,
    updateTime: Date.now(),
  };
  accounts.push(houseRow);
  await store.setAccountsForUser(uid, accounts);
  return {
    created: true,
    account: sanitizeAccountForAdmin(houseRow),
  };
}

/** 管理端修改指定用户账号乘网（普通用户自助保存会被服务端忽略 multiply） */
export async function updateAdminAccountMultiply(userId, accountId, multiply, caller = null) {
  return updateAdminAccountFields(userId, accountId, { multiply }, caller);
}

/**
 * 管理端更新子账号字段（额度 / 暂停 / 乘网 / 备注等）
 * @param {string} userId
 * @param {number} accountId
 * @param {Record<string, unknown> | string} patch
 * @param {object | null} caller
 */
export async function updateAdminAccountFields(userId, accountId, patch = {}, caller = null) {
  const uid = String(userId || "").trim();
  const aid = Number(accountId);
  if (!uid)
    throw new Error("用户 ID 无效");
  if (!aid)
    throw new Error("accountId 无效");
  if (caller && !isAdminUser(caller)) {
    const visibleIds = await getVisibleUserIds(caller);
    if (visibleIds && !visibleIds.has(uid))
      throw new Error("无权操作该用户");
  }
  await loadProfileById(uid);
  await loadAccountsForUser(uid);
  const accounts = store.getAccountsForUser(uid);
  const row = accounts.find(a => Number(a.accountId ?? a.AccountId) === aid);
  if (!row)
    throw new Error("账号不存在");

  let fields = patch;
  if (typeof fields === "string") {
    try {
      fields = JSON.parse(fields);
    }
    catch {
      throw new Error("patch JSON 无效");
    }
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    fields = {};

  const updates = {};
  const isPf = String(row.provider || row.Provider || "") === "PredictFun"
    || String(row.platformName || "").toLowerCase().includes("predict");

  // PF：直接写 total_balance（balance）；credit 固定 0。其它场馆仍改 credit 授信
  if (isPf && ("balance" in fields || "credit" in fields)) {
    const targetBalance = "balance" in fields
      ? Number(fields.balance)
      : Number(fields.credit);
    updates.balance = Number.isFinite(targetBalance) ? targetBalance : 0;
    updates.credit = 0;
  }
  else if ("credit" in fields) {
    updates.credit = Number(fields.credit) || 0;
  }
  if ("maxBalance" in fields)
    updates.maxBalance = Number(fields.maxBalance) || 0;
  if ("pause" in fields)
    updates.pause = parseFormBool(fields.pause);
  if ("description" in fields)
    updates.description = String(fields.description ?? "");
  if ("currency" in fields)
    updates.currency = String(fields.currency || "").trim() || undefined;
  if ("multiply" in fields) {
    const providerKey = accountProviderKey(row);
    updates.multiply = resolveAccountMultiply(providerKey, fields.multiply);
  }
  if (!Object.keys(updates).length)
    throw new Error("没有可更新的字段");

  const updated = await store.updateAccountForUser(uid, aid, updates);
  if (!updated)
    throw new Error("更新失败");
  // PredictFun house 默认 USDT：历史行可能缺 currency
  let result = updated;
  if (String(updated.provider || row.provider || "") === "PredictFun"
    && !String(updated.currency || "").trim()) {
    const withCcy = await store.updateAccountForUser(uid, aid, { currency: "USDT" });
    result = withCcy || updated;
  }
  // 改余额后刷新展示字段（读 total_balance）
  if (isPf && ("balance" in updates || "credit" in updates)) {
    try {
      const { handlePfRefreshBalance } = await import("../integrations/predictfun/pf_client_handlers.js");
      const refreshed = await handlePfRefreshBalance({ playerId: aid }, uid);
      if (refreshed.ok && refreshed.info)
        return sanitizeAccountForAdmin({ ...result, ...refreshed.info, credit: 0 });
    }
    catch (err) {
      console.warn("[admin] Pf refresh after balance update:", err?.message || err);
    }
  }
  return sanitizeAccountForAdmin(result);
}

/** 管理端开关用户 BetTarget（profiles.betting_config，对齐 A8 Setting） */
export async function updateAdminUserBetTarget(userId, betTarget, caller = null) {
  const uid = String(userId || "").trim();
  if (!uid)
    throw new Error("用户 ID 无效");
  if (caller && !isAdminUser(caller)) {
    const visibleIds = await getVisibleUserIds(caller);
    if (visibleIds && !visibleIds.has(uid))
      throw new Error("无权操作该用户");
  }
  await loadProfileById(uid);
  const enabled = parseFormBool(betTarget);
  store.updateUserSetting(uid, { BetTarget: enabled });
  const row = listProfileRows().find(p => String(p.id) === uid);
  if (!row)
    throw new Error("用户不存在");
  const setting = profileSettingForAdmin(row);
  setting.BetTarget = enabled;
  return {
    id: uid,
    userName: String(row.user_name || ""),
    betTarget: enabled,
    setting,
  };
}

/** 登录/API 鉴权占位（A8 bundle 无 admin 冻结用户） */
export async function assertProfileActive(_userId) {}

/** 管理端设置/取消管理员（users.is_admin） */
export async function setAdminUserAdmin(userId, isAdmin, operatorUserId) {
  const id = String(userId || "").trim();
  if (!id)
    throw new Error("用户 ID 无效");
  const wantAdmin = Boolean(isAdmin);
  const op = String(operatorUserId || "").trim();
  if (op && id === op && !wantAdmin) {
    throw new Error("不能取消当前登录账号的管理员权限");
  }

  const row = await sb.fetchProfileById(id);
  if (!row)
    throw new Error("用户不存在");
  const name = String(row.user_name || "");
  const wasAdmin = Boolean(row.is_admin);
  if (wasAdmin === wantAdmin) {
    return { id, userName: name, isAdmin: wantAdmin ? 1 : 0 };
  }

  if (wasAdmin && !wantAdmin) {
    await ensurePgPoolReady();
    const pool = getPgPool();
    if (!pool)
      throw new Error("RDS 未配置");
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true",
    );
    if ((rows[0]?.n ?? 0) <= 1) {
      throw new Error("至少保留一名管理员");
    }
  }

  const ok = await sb.updateUserIsAdmin(id, wantAdmin);
  if (!ok)
    throw new Error("更新管理员状态失败");
  await loadProfileById(id);
  return { id, userName: name, isAdmin: wantAdmin ? 1 : 0 };
}

const VALID_ROLES = ["admin", "leader", "user"];

/** 管理端设置用户角色和团队 */
export async function setAdminUserRole(userId, role, teamId, operatorUserId) {
  const id = String(userId || "").trim();
  if (!id)
    throw new Error("用户 ID 无效");
  if (!VALID_ROLES.includes(role))
    throw new Error("无效角色，可选：admin / leader / user");
  const op = String(operatorUserId || "").trim();
  const currentRole = op ? (await sb.fetchProfileById(op))?.role : null;
  if (op && id === op && role !== currentRole) {
    throw new Error("不能更改当前登录账号的角色");
  }

  const row = await sb.fetchProfileById(id);
  if (!row)
    throw new Error("用户不存在");
  const name = String(row.user_name || "");
  const wasAdmin = Boolean(row.is_admin) || row.role === "admin";

  if (wasAdmin && role !== "admin") {
    await ensurePgPoolReady();
    const pool = getPgPool();
    if (!pool)
      throw new Error("RDS 未配置");
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true",
    );
    if ((rows[0]?.n ?? 0) <= 1) {
      throw new Error("至少保留一名管理员");
    }
  }

  const tid = teamId !== undefined ? (teamId || null) : row.team_id;

  if (role === "leader" && !tid) {
    throw new Error("团队长必须分配到一个团队");
  }

  if (tid) {
    const teams = await sb.fetchTeams();
    if (!teams.some(t => t.id === tid)) {
      throw new Error(`团队「${tid}」不存在，请先创建`);
    }
  }

  const roleOk = await sb.updateUserRole(id, role);
  if (!roleOk)
    throw new Error("更新角色失败");
  if (tid !== row.team_id) {
    await sb.updateUserTeamId(id, tid);
  }
  await loadProfileById(id);
  return { id, userName: name, role, teamId: tid || null, isAdmin: role === "admin" ? 1 : 0 };
}

/** 管理端：团队列表 */
export async function listTeams() {
  return sb.fetchTeams();
}

/** 管理端：创建或更新团队（id 为空时自动生成） */
export async function upsertTeam(id, name) {
  const tname = String(name || "").trim();
  if (!tname)
    throw new Error("团队名称必填");
  const tid = String(id || "").trim() || `t${Date.now().toString(36)}`;
  const ok = await sb.upsertTeam(tid, tname);
  if (!ok)
    throw new Error("保存团队失败");
  return { id: tid, name: tname };
}

/** 管理端：删除团队 */
export async function deleteTeam(id) {
  const tid = String(id || "").trim();
  if (!tid)
    throw new Error("团队 ID 必填");
  await ensurePgPoolReady();
  const pool = getPgPool();
  if (pool) {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE team_id = $1",
      [tid],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      throw new Error(`团队内还有 ${rows[0].n} 个成员，请先移除`);
    }
  }
  const ok = await sb.deleteTeam(tid);
  if (!ok)
    throw new Error("删除团队失败或不存在");
  return { id: tid };
}

export async function getPlatformAnalytics(body = {}, caller = null) {
  let startMs, endMs;
  // form-urlencoded：all=true 会变成字符串 "true"
  const allFlag = body.all === true || body.all === 1 || body.all === "1"
    || body.all === "true" || body.all === "yes"
    || body.period === "all" || body.range === "all";
  if (allFlag) {
    // 「全部」：从 epoch 到当前时刻后 1ms（半开区间）
    startMs = 0;
    endMs = Date.now() + 1;
  }
  else if (body.startMs && body.endMs) {
    startMs = Number(body.startMs);
    endMs = Number(body.endMs);
  }
  else if (body.month) {
    const parts = String(body.month).split("-").map(Number);
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || new Date().getMonth() + 1;
    startMs = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
    endMs = new Date(y, m, 1, 0, 0, 0, 0).getTime();
  }
  else {
    const dk = body.date || toDateKey(Date.now());
    const parts = String(dk).split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] || 1, 0, 0, 0, 0);
    startMs = d.getTime();
    endMs = startMs + 86400000;
  }
  let userIds;
  if (caller && !isAdminUser(caller)) {
    const allProfiles = await sb.fetchProfilesAdmin();
    const visibleIds = resolveVisibleUserIds(caller, allProfiles);
    if (visibleIds)
      userIds = [...visibleIds];
  }
  const [platforms, pairs, games, hourly, accounts, obArbOdds] = await Promise.all([
    sb.fetchPlatformAnalytics(startMs, endMs, userIds),
    sb.fetchArbPairAnalytics(startMs, endMs, userIds),
    sb.fetchGameAnalytics(startMs, endMs, userIds),
    sb.fetchHourlyAnalytics(startMs, endMs, userIds),
    sb.fetchAccountAnalytics(startMs, endMs, userIds),
    sb.fetchObArbOddsAnalytics(startMs, endMs, userIds),
  ]);
  return { startMs, endMs, platforms, pairs, games, hourly, accounts, obArbOdds };
}

export async function getPolymarketBuilderDashboard(body = {}, caller = null) {
  if (caller && !isAdminUser(caller))
    throw new Error("无管理员权限");
  const { getPolymarketBuilderDashboard: load } = await import(
    "../integrations/polymarket/builder_dashboard.js"
  );
  return load(body, caller);
}
