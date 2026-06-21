import crypto from "node:crypto";
import * as sb from "@changmen/db";
import { ensurePgPoolReady, getPgPool, insertProfile } from "@changmen/db";
import { loadProfileById } from "../db/store.js";
import { resolveStoredLink, toDateKey, listUserProfitRank } from "./order_store.js";
import { resolvePresenceState } from "./user_presence.js";
import {
  lastLoginFieldsFromProfile,
  PROFILE_META_PREFERENCE_KEYS,
} from "./user_login_meta.js";
import { resolveAccountMultiply } from "@changmen/shared/account_multiply.mjs";
import { lookupOrderLogs, toAdminOrderLogPayload } from "../admin_tools/user_log_lookup.js";
import { isAdminUser, isLeaderUser, getTeamId } from "./admin_auth.js";

function accountCount(accounts) {
  return Array.isArray(accounts) ? accounts.length : 0;
}

/** 管理端账号：含 gateway/token/referer 等完整凭证（仅 Client_Admin* 接口，需 is_admin） */
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
    const prefsForAdmin = Object.fromEntries(
      Object.entries(prefs).filter(([k]) => !PROFILE_META_PREFERENCE_KEYS.has(k)),
    );
    return sanitizeSettingForAdmin({
      ...prefsForAdmin,
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
  const prefsForAdmin = Object.fromEntries(
    Object.entries(prefs).filter(([k]) => !PROFILE_META_PREFERENCE_KEYS.has(k)),
  );
  return sanitizeSettingForAdmin({
    ...prefsForAdmin,
    ...betting,
    ...(Object.keys(collect).length ? { CollectConfig: collect } : {}),
  });
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

function resolveVisibleUserIds(caller, allProfiles) {
  if (!caller || isAdminUser(caller)) return null;
  const teamId = getTeamId(caller);
  if (isLeaderUser(caller) && teamId) {
    return new Set((allProfiles || []).filter((p) => p.team_id === teamId).map((p) => String(p.id)));
  }
  return new Set([String(caller.id)]);
}

/** 团队长权限下可见的 userId 列表（admin 返回 null = 全部可见） */
export async function getVisibleUserIds(caller) {
  if (!caller || isAdminUser(caller)) return null;
  const allProfiles = await sb.fetchProfilesAdmin();
  return resolveVisibleUserIds(caller, allProfiles);
}

function filterProfiles(profiles, visibleIds) {
  if (!visibleIds) return profiles;
  return (profiles || []).filter((p) => visibleIds.has(String(p.id)));
}

function mapAdminUserRow(p, profitByUser = new Map()) {
  const name = String(p.user_name || "");
  const stats = profitByUser.get(name.toLowerCase());
  const accountsRaw = Array.isArray(p.accounts) ? p.accounts : [];
  const accounts = accountsRaw
    .map(sanitizeAccountForAdmin)
    .filter(Boolean);
  const id = String(p.id);
  const presence = resolvePresenceState(id, p);
  const bettingState = resolveBettingState(p);
  return {
    id,
    userName: name,
    isAdmin: Boolean(p.is_admin),
    role: p.role || (Boolean(p.is_admin) ? "admin" : "user"),
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
    (Array.isArray(rank) ? rank : []).map((r) => [String(r.UserName).toLowerCase(), r]),
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
    ? new Set(profiles.map((p) => String(p.user_name || "").toLowerCase()))
    : null;
  const topProfit = (Array.isArray(rank) ? rank : [])
    .filter((r) => !visibleNames || visibleNames.has(String(r.UserName).toLowerCase()))
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
    (Array.isArray(rank) ? rank : []).map((r) => [String(r.UserName).toLowerCase(), r]),
  );
  return profiles
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
  const profitByUser = new Map(
    (Array.isArray(rank) ? rank : []).map((r) => [String(r.UserName).toLowerCase(), r]),
  );
  const profile = (profiles || []).find((p) => String(p.id) === id);
  if (!profile) return null;
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
    if (!startTime) continue;
    if (id) byId.set(id, startTime);
    const title = stripOrderHtml(m.title ?? m.Title ?? "");
    if (title && !byTitle.has(title)) byTitle.set(title, startTime);
  }
  return { byId, byTitle };
}

function resolveMatchStartTime(col, startIndex) {
  const raw = col.raw || {};
  const fromRaw = Number(
    raw.startTime ?? raw.StartTime ?? raw.start_time ?? raw.matchStartTime ?? 0,
  ) || 0;
  if (fromRaw) return fromRaw;
  if (!startIndex) return 0;
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
  const safeStartIndex =
    startIndex &&
    typeof startIndex === "object" &&
    !Array.isArray(startIndex) &&
    (startIndex.byId instanceof Map || startIndex.byTitle instanceof Map)
      ? startIndex
      : null;
  return {
    id: Number(r.id),
    userId: String(r.user_id),
    playerId: Number(r.player_id) || 0,
    orderId: String(r.order_id || ""),
    linkId: resolveStoredLink(r.link, r.order_id, r.create_at),
    provider: String(r.provider || ""),
    match: stripOrderHtml(r.match || ""),
    bet: String(r.bet || ""),
    item: String(r.item || ""),
    odds: Number(r.odds) || 0,
    betMoney: Number(r.bet_money) || 0,
    money: Number(r.money) || 0,
    status: String(r.status || ""),
    createAt: Number(r.create_at) || 0,
    matchId: col.matchId,
    matchKey: col.key,
    matchLabel: col.label,
    matchStartTime: resolveMatchStartTime(col, safeStartIndex),
  };
}

export async function listAdminOrders(body = {}, caller = null) {
  const dateKey = body.date ? String(body.date) : toDateKey(Date.now());
  const pageIndex = Math.max(1, Number(body.pageIndex) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(body.pageSize) || 50));
  const userId = body.userId ? String(body.userId) : "";
  const provider = body.provider ? String(body.provider) : "";

  let userIds;
  if (caller && !isAdminUser(caller)) {
    const allProfiles = await sb.fetchProfilesAdmin();
    const visibleIds = resolveVisibleUserIds(caller, allProfiles);
    if (visibleIds) {
      if (userId && !visibleIds.has(userId)) {
        return { date: dateKey, list: [], total: 0, pageIndex, pageSize };
      }
      userIds = [...visibleIds];
    }
  }

  const filter = {
    dateKey,
    userId: userId || undefined,
    provider: provider || undefined,
    userIds,
  };
  const { rows, total } = await sb.fetchOrdersAdminPage({ ...filter, pageIndex, pageSize });
  const list = (rows || []).map((r) => mapAdminOrderRow(r));
  return { date: dateKey, list, total, pageIndex, pageSize };
}

/** 管理端：按主键 id 删除订单（可批量，如同 Link 套利组） */
export async function deleteAdminOrders(body = {}) {
  const raw = body.orderIds ?? body.ids ?? body.id;
  const ids = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const deleted = await sb.deleteOrdersByIds(ids);
  if (!deleted) throw new Error("删除失败或订单不存在");
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
    if (visibleIds) userIds = [...visibleIds];
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
  const startIndex = buildClientMatchStartIndex(clientMatches);
  const list = (rows || []).map((r) => mapAdminOrderRow(r, startIndex));
  return { date: dateKey, list, total: list.length };
}

/** 管理端：Link / order_id 关联 Client_SaveUserLog 诊断 */
export async function listAdminOrderLogs(body = {}, caller = null) {
  const userId = String(body.userId ?? body.user_id ?? "").trim();
  const linkRaw = body.linkId ?? body.link ?? body.LinkID;
  const orderId = body.orderId ?? body.order_id ?? body.OrderID;
  if (!userId) throw new Error("缺少 userId");
  if (linkRaw == null && !orderId) throw new Error("请指定 linkId 或 orderId");

  const result = await lookupOrderLogs({
    userId,
    link: linkRaw != null ? linkRaw : undefined,
    orderId: orderId ? String(orderId) : undefined,
    paddingMs: body.paddingMs,
    logLimit: body.logLimit,
  });
  const payload = toAdminOrderLogPayload(result);
  if (!payload.ok) throw new Error(payload.error || "查询失败");
  return payload;
}

function validateNewPassword(password) {
  const pwd = String(password || "");
  if (pwd.length < 6) throw new Error("密码至少 6 位");
  return pwd;
}

function validateUserName(userName) {
  const name = String(userName || "").trim();
  if (!name) throw new Error("用户名必填");
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(name)) {
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
  if (!pool) throw new Error("RDS 未配置，无法创建用户");
  const existing = await pool.query(
    "SELECT id FROM users WHERE lower(user_name) = lower($1)",
    [name],
  );
  if (existing.rows.length) throw new Error("用户名已存在");
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
  if (!ok) throw new Error("profiles 创建失败");
  return { id: userId, userName: name };
}

/** 管理端删除用户（profiles ON DELETE CASCADE 自动级联） */
export async function deleteAdminUser(userId, operatorUserId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("用户 ID 无效");
  if (id === String(operatorUserId || "").trim()) {
    throw new Error("不能删除当前登录账号");
  }
  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool) throw new Error("RDS 未配置");
  const { rows } = await pool.query("SELECT user_name, is_admin FROM users WHERE id = $1", [id]);
  if (!rows[0]) throw new Error("用户不存在");
  if (rows[0].is_admin) {
    const { rows: admins } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true",
    );
    if ((admins[0]?.n ?? 0) <= 1) throw new Error("至少保留一名管理员");
  }
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  return { id, userName: String(rows[0].user_name) };
}

/** 管理端更改登录用户名 */
export async function renameAdminUser(userId, userName) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("用户 ID 无效");
  const name = validateUserName(userName);

  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool) throw new Error("RDS 未配置");

  const { rows } = await pool.query(
    "SELECT user_name FROM users WHERE id = $1",
    [id],
  );
  if (!rows[0]) throw new Error("用户不存在");
  const current = String(rows[0].user_name || "");
  if (current.toLowerCase() === name.toLowerCase()) {
    if (current === name) return { id, userName: name };
    const ok = await sb.updateUserName(id, name);
    if (!ok) throw new Error("更新用户名失败");
    await loadProfileById(id);
    return { id, userName: name };
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE lower(user_name) = lower($1) AND id <> $2",
    [name, id],
  );
  if (existing.rows.length) throw new Error("用户名已存在");

  const ok = await sb.updateUserName(id, name);
  if (!ok) throw new Error("更新用户名失败");
  await loadProfileById(id);
  return { id, userName: name };
}

/** 管理端重置用户登录密码 */
export async function resetAdminUserPassword(userId, password) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("用户 ID 无效");
  const pwd = validateNewPassword(password);
  const now = Date.now();

  await ensurePgPoolReady();
  const pool = getPgPool();
  if (!pool) throw new Error("RDS 未配置");
  const { rows } = await pool.query(
    "SELECT user_name FROM users WHERE id = $1",
    [id],
  );
  if (!rows[0]) throw new Error("用户不存在");
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
  if (!pool) throw new Error("RDS 未配置");
  const { rowCount } = await pool.query(
    `UPDATE profiles SET preferences = $2::jsonb, updated_at = $3 WHERE id = $1`,
    [id, JSON.stringify(preferences || {}), now],
  );
  if (!rowCount) throw new Error("用户不存在");
}

/** 登录/API 鉴权占位（A8 bundle 无 admin 冻结用户） */
export async function assertProfileActive(_userId) {}

/** 管理端设置/取消管理员（users.is_admin） */
export async function setAdminUserAdmin(userId, isAdmin, operatorUserId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("用户 ID 无效");
  const wantAdmin = Boolean(isAdmin);
  const op = String(operatorUserId || "").trim();
  if (op && id === op && !wantAdmin) {
    throw new Error("不能取消当前登录账号的管理员权限");
  }

  const row = await sb.fetchProfileById(id);
  if (!row) throw new Error("用户不存在");
  const name = String(row.user_name || "");
  const wasAdmin = Boolean(row.is_admin);
  if (wasAdmin === wantAdmin) {
    return { id, userName: name, isAdmin: wantAdmin ? 1 : 0 };
  }

  if (wasAdmin && !wantAdmin) {
    await ensurePgPoolReady();
    const pool = getPgPool();
    if (!pool) throw new Error("RDS 未配置");
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE is_admin = true",
    );
    if ((rows[0]?.n ?? 0) <= 1) {
      throw new Error("至少保留一名管理员");
    }
  }

  const ok = await sb.updateUserIsAdmin(id, wantAdmin);
  if (!ok) throw new Error("更新管理员状态失败");
  await loadProfileById(id);
  return { id, userName: name, isAdmin: wantAdmin ? 1 : 0 };
}

const VALID_ROLES = ["admin", "leader", "user"];

/** 管理端设置用户角色和团队 */
export async function setAdminUserRole(userId, role, teamId, operatorUserId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("用户 ID 无效");
  if (!VALID_ROLES.includes(role)) throw new Error("无效角色，可选：admin / leader / user");
  const op = String(operatorUserId || "").trim();
  const currentRole = op ? (await sb.fetchProfileById(op))?.role : null;
  if (op && id === op && role !== currentRole) {
    throw new Error("不能更改当前登录账号的角色");
  }

  const row = await sb.fetchProfileById(id);
  if (!row) throw new Error("用户不存在");
  const name = String(row.user_name || "");
  const wasAdmin = Boolean(row.is_admin) || row.role === "admin";

  if (wasAdmin && role !== "admin") {
    await ensurePgPoolReady();
    const pool = getPgPool();
    if (!pool) throw new Error("RDS 未配置");
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
    if (!teams.find((t) => t.id === tid)) {
      throw new Error(`团队「${tid}」不存在，请先创建`);
    }
  }

  const roleOk = await sb.updateUserRole(id, role);
  if (!roleOk) throw new Error("更新角色失败");
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
  if (!tname) throw new Error("团队名称必填");
  const tid = String(id || "").trim() || `t${Date.now().toString(36)}`;
  const ok = await sb.upsertTeam(tid, tname);
  if (!ok) throw new Error("保存团队失败");
  return { id: tid, name: tname };
}

/** 管理端：删除团队 */
export async function deleteTeam(id) {
  const tid = String(id || "").trim();
  if (!tid) throw new Error("团队 ID 必填");
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
  if (!ok) throw new Error("删除团队失败或不存在");
  return { id: tid };
}

export async function getPlatformAnalytics(body = {}, caller = null) {
  let startMs, endMs;
  if (body.startMs && body.endMs) {
    startMs = Number(body.startMs);
    endMs = Number(body.endMs);
  } else if (body.month) {
    const parts = String(body.month).split("-").map(Number);
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || new Date().getMonth() + 1;
    startMs = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
    endMs = new Date(y, m, 1, 0, 0, 0, 0).getTime();
  } else {
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
    if (visibleIds) userIds = [...visibleIds];
  }
  const [platforms, pairs, games, hourly, accounts] = await Promise.all([
    sb.fetchPlatformAnalytics(startMs, endMs, userIds),
    sb.fetchArbPairAnalytics(startMs, endMs, userIds),
    sb.fetchGameAnalytics(startMs, endMs, userIds),
    sb.fetchHourlyAnalytics(startMs, endMs, userIds),
    sb.fetchAccountAnalytics(startMs, endMs, userIds),
  ]);
  return { startMs, endMs, platforms, pairs, games, hourly, accounts };
}
