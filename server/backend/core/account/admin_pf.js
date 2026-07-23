/**
 * 管理端 PredictFun 子域（会员列表 / 费率 / house 开户 / 充值 / 流水）。
 * 对外仍由 admin_service.js 原名 re-export，避免 router / 测例改 import。
 */
import * as sb from "@changmen/db";
import { isAdminUser } from "../auth/admin_auth.js";
import { filterProfiles, getVisibleUserIds, resolveVisibleUserIds } from "../auth/role_filter.js";
import { listProfileRows, loadAccountsForUser, loadProfileById } from "../db/store.js";
import store from "../esport-api/store.js";
import { summarizePfOrders } from "../integrations/predictfun/pf_ledger.js";
import * as accountStore from "./account_store.js";
import { sanitizeAccountForAdmin } from "./admin_account_sanitize.js";
import * as orderStore from "./order_store.js";

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

/** Changmencodefee 买卖费率（管理端全局配置） */
export async function getAdminPredictFunFeeConfig(caller = null) {
  if (caller && !isAdminUser(caller))
    throw new Error("无管理员权限");
  const { getPfChangmenFeeConfig } = await import("../integrations/predictfun/pf_changmen_fee_config.js");
  const cfg = getPfChangmenFeeConfig();
  return {
    buyFeeRateBps: cfg.buyFeeRateBps,
    sellFeeRateBps: cfg.sellFeeRateBps,
    buyFeeRatePercent: cfg.buyFeeRateBps / 100,
    sellFeeRatePercent: cfg.sellFeeRateBps / 100,
    updatedAt: cfg.updatedAt ?? null,
  };
}

/**
 * @param {{ buyFeeRateBps?: number, sellFeeRateBps?: number, buyFeeRatePercent?: number, sellFeeRatePercent?: number }} body
 */
export async function saveAdminPredictFunFeeConfig(body = {}, caller = null) {
  if (!caller || !isAdminUser(caller))
    throw new Error("无管理员权限");
  const { savePfChangmenFeeConfig } = await import("../integrations/predictfun/pf_changmen_fee_config.js");
  const cfg = savePfChangmenFeeConfig(body);
  return {
    buyFeeRateBps: cfg.buyFeeRateBps,
    sellFeeRateBps: cfg.sellFeeRateBps,
    buyFeeRatePercent: cfg.buyFeeRateBps / 100,
    sellFeeRatePercent: cfg.sellFeeRateBps / 100,
    updatedAt: cfg.updatedAt ?? null,
  };
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

/**
 * PF 管理端充值：按增量加 total_balance，并写入 money_logs（Type=Recharge）。
 * 禁止用绝对值改余额；纠错请另开运维路径。
 * @param {string} userId 会员所属用户
 * @param {number} accountId
 * @param {{ amount?: number, money?: number, description?: string }} body
 * @param {object | null} caller
 */
export async function rechargeAdminPredictFunMember(userId, accountId, body = {}, caller = null) {
  const uid = String(userId || "").trim();
  const aid = Number(accountId);
  if (!uid)
    throw new Error("用户 ID 无效");
  if (!aid)
    throw new Error("accountId 无效");
  if (!caller || !isAdminUser(caller))
    throw new Error("无管理员权限");
  const visibleIds = await getVisibleUserIds(caller);
  if (visibleIds && !visibleIds.has(uid))
    throw new Error("无权操作该用户");

  const amount = Math.round((Number(body.amount ?? body.money) || 0) * 100) / 100;
  if (!(amount > 0))
    throw new Error("充值金额必须大于 0");

  await loadProfileById(uid);
  await loadAccountsForUser(uid);
  const accounts = store.getAccountsForUser(uid);
  const row = accounts.find(a => Number(a.accountId ?? a.AccountId) === aid);
  if (!row)
    throw new Error("账号不存在");
  const provider = String(row.provider || row.Provider || "");
  if (provider !== "PredictFun")
    throw new Error("仅支持 PredictFun 会员充值");

  const player = await accountStore.getPlayer(aid);
  if (!player || String(player.ownerUserId || "") !== uid)
    throw new Error("会员归属不匹配");

  const maxBalance = Number(row.maxBalance ?? row.MaxBalance) || 0;
  const adminName = String(caller.userName || caller.user_name || caller.id || "admin").trim();
  const note = String(body.description ?? body.Description ?? "").trim();
  const description = note
    ? `管理员充值 by ${adminName}：${note}`
    : `管理员充值 by ${adminName}`;

  const tx = await accountStore.rechargePlayerBalanceWithMoneyLog({
    playerId: aid,
    ownerUserId: uid,
    amount,
    description,
    currency: "USDT",
    maxBalance,
  });
  if (!tx?.ok)
    throw new Error(tx?.msg || "充值失败");

  const r = tx.log;
  const logId = Number(r?.id ?? r?.logId) || 0;
  const mappedLog = {
    logId,
    ID: logId,
    playerId: Number(r?.player_id ?? r?.playerId) || aid,
    PlayerID: Number(r?.player_id ?? r?.playerId) || aid,
    type: String(r?.type || "Recharge"),
    Type: String(r?.type || "Recharge"),
    money: Number(r?.money) || amount,
    Money: Number(r?.money) || amount,
    currency: String(r?.currency || "USDT"),
    Currency: String(r?.currency || "USDT"),
    description: String(r?.description || description),
    Description: String(r?.description || description),
    createAt: Number(r?.create_at ?? r?.createAt) || Date.now(),
    CreateAt: Number(r?.create_at ?? r?.createAt) || Date.now(),
    isAuto: 0,
    IsAuto: 0,
  };

  const { publishPfBalanceKnown } = await import("../integrations/predictfun/pf_player_account.js");
  const published = await publishPfBalanceKnown(aid, uid, tx.total);

  return {
    ok: true,
    amount: tx.amount,
    balanceBefore: tx.balanceBefore,
    balance: tx.total,
    log: mappedLog,
    info: published?.ok ? published.info : { accountId: aid, balance: tx.total, currency: "USDT" },
  };
}

/**
 * PF 管理端：查看该会员充提记录（含管理员充值流水）
 */
export async function listAdminPredictFunMoneyLogs(userId, accountId, body = {}, caller = null) {
  const uid = String(userId || "").trim();
  const aid = Number(accountId);
  if (!uid)
    throw new Error("用户 ID 无效");
  if (!aid)
    throw new Error("accountId 无效");
  if (!caller || !isAdminUser(caller))
    throw new Error("无管理员权限");
  const visibleIds = await getVisibleUserIds(caller);
  if (visibleIds && !visibleIds.has(uid))
    throw new Error("无权操作该用户");

  await loadAccountsForUser(uid);
  const accounts = store.getAccountsForUser(uid);
  const row = accounts.find(a => Number(a.accountId ?? a.AccountId) === aid);
  if (!row)
    throw new Error("账号不存在");
  if (String(row.provider || row.Provider || "") !== "PredictFun")
    throw new Error("仅支持 PredictFun 会员");

  const pageIndex = Number(body.pageIndex) || 1;
  const pageSize = Math.min(100, Math.max(1, Number(body.pageSize) || 20));
  return accountStore.listMoneyLogs(aid, pageIndex, pageSize, uid);
}
