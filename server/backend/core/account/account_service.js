import { normalizeAccountMultiplyField } from "@changmen/shared/account_multiply.mjs";
import { listProfileRows } from "../db/store.js";
import store from "../esport-api/store.js";
import { emptyPage } from "../esport-api/stubs.js";
import {
  emptyDirectValue,
  isArrayKey,
  wrapObjectDirect,
} from "../esport-api/user_kv.js";
import * as accountStore from "./account_store.js";
import {
  enrichAccountFromPlatformDefaults,
  getAccountBalance,
} from "./balance_provider.js";
import * as orderStore from "./order_store.js";
import { resolvePresenceState } from "./user_presence.js";

async function handleCreateTagPlatform(body) {
  const platformName = body.platform || body.platformName || "";
  const playerName = body.playerName || "";
  if (!platformName || !playerName) {
    return { ok: false, msg: "platform 与 playerName 必填" };
  }
  try {
    const created = await accountStore.createTagPlatform(platformName, playerName);
    return { ok: true, info: created };
  }
  catch (err) {
    return { ok: false, msg: err.message || "CreateTagPlatform 失败" };
  }
}

async function handleGetTagPlatforms() {
  return { ok: true, info: await accountStore.listTagPlatforms() };
}

async function handleUpdateBalance(body, userId) {
  const playerId = body.playerId;
  const balance = Number(body.balance);
  if (!playerId || Number.isNaN(balance)) {
    return { ok: false, msg: "playerId 与 balance 必填" };
  }
  if (userId) {
    const userAccountIds = new Set(store.getAccountsForUser(userId).map(a => Number(a.accountId)));
    if (!userAccountIds.has(Number(playerId))) {
      return { ok: false, msg: "账号不属于当前用户" };
    }
  }
  const player = await accountStore.getPlayer(playerId);
  if (!player) {
    return { ok: false, msg: "player 不存在" };
  }
  const info = await accountStore.updatePlayerBalance(playerId, balance);
  if (!info) {
    return { ok: false, msg: "更新余额失败" };
  }
  return { ok: true, info };
}

async function handleDeletePlayer(body, userId) {
  const playerId = body.playerId;
  if (!playerId)
    return { ok: false, msg: "playerId 必填" };
  const ok = await accountStore.deletePlayer(playerId, body.description || "");
  if (ok)
    await accountStore.deletePlayerData(playerId);
  if (userId)
    store.removeAccountForUser(userId, playerId);
  return ok ? { ok: true, info: true } : { ok: false, msg: "player 不存在" };
}

async function handleGetMoneyLogs(body, userId) {
  const playerId = body.playerId;
  if (!playerId)
    return { ok: false, msg: "playerId 必填" };
  const pageIndex = Number(body.pageIndex) || 1;
  const pageSize = Number(body.pageSize) || 20;
  return { ok: true, info: await accountStore.listMoneyLogs(playerId, pageIndex, pageSize, userId) };
}

async function handleGetMoneyLog(body, userId) {
  const row = await accountStore.getMoneyLog(body.logId, userId);
  return { ok: true, info: row };
}

async function handleSaveMoneyLog(body, userId) {
  if (!userId)
    return { ok: false, msg: "请先登录" };
  const playerId = body.playerId ?? body.PlayerID;
  if (!playerId)
    return { ok: false, msg: "playerId 必填" };
  const userAccountIds = new Set(store.getAccountsForUser(userId).map(a => Number(a.accountId)));
  if (!userAccountIds.has(Number(playerId))) {
    return { ok: false, msg: "账号不属于当前用户" };
  }
  const row = await accountStore.saveMoneyLog(body, userId);
  if (!row)
    return { ok: false, msg: "保存失败" };
  return { ok: true, info: row };
}

async function handleDeleteMoneyLog(body, userId) {
  const ok = await accountStore.deleteMoneyLog(body.logId, userId);
  return ok ? { ok: true, info: true } : { ok: false, msg: "log 不存在" };
}

async function handleGetPlayerOrder(body, userId) {
  const playerId = body.playerId;
  if (!playerId)
    return { ok: false, msg: "playerId 必填" };
  const page = await accountStore.listMoneyLogs(playerId, 1, 10000, userId);
  const logs = (page.data || []).map(row => ({
    ID: row.logId,
    Type: row.type,
    Money: Number(row.money) || 0,
    Currency: row.currency || "CNY",
    Description: row.description || "",
    IsAuto: /\d+sec|\d+s$/i.test(row.description || "") ? 1 : 0,
    CreateAt: row.createAt || 0,
  }));
  const orders = await orderStore.listByPlayer(playerId, userId);
  return { ok: true, info: { logs, orders } };
}

async function handleSaveOrder(body, userId) {
  const playerId = body.playerId;
  if (!playerId)
    return { ok: false, msg: "playerId 必填" };
  if (userId) {
    const userAccountIds = new Set(store.getAccountsForUser(userId).map(a => Number(a.accountId)));
    if (!userAccountIds.has(Number(playerId))) {
      return { ok: false, msg: "账号不属于当前用户" };
    }
  }
  let orders = [];
  try {
    orders = JSON.parse(body.orders || "[]");
  }
  catch {
    return { ok: false, msg: "orders JSON 无效" };
  }
  const saved = await orderStore.saveOrder(
    playerId,
    orders,
    userId,
    body.type || body.Type || "",
  );
  if (!saved)
    return { ok: false, msg: "保存订单失败" };
  return { ok: true, info: true };
}

function handleGetUsers() {
  const info = listProfileRows().map((p) => {
    const id = String(p.id);
    const presence = resolvePresenceState(id, p);
    return {
      userId: id,
      userName: p.user_name || "",
      isOnline: presence.isOnline,
    };
  });
  return { ok: true, info };
}

/** A8 Io.loadAccounts：ACCOUNT 返回时归一化 PB 乘网默认 */
function enrichAccountRowFromPlayer(row) {
  return normalizeAccountMultiplyField(row);
}

/** [A8 可证实] accountId = CreateTagPlatform 返回的 playerId，禁止客户端自增 */
async function validateAccountRows(accounts) {
  if (!Array.isArray(accounts))
    return { ok: false, msg: "ACCOUNT 必须是数组" };
  const seen = new Set();
  for (const row of accounts) {
    const id = Number(row?.accountId ?? row?.AccountId);
    if (!id) {
      return { ok: false, msg: "accountId 无效，请先调用 Client_CreateTagPlatform" };
    }
    if (seen.has(id))
      return { ok: false, msg: `accountId ${id} 重复` };
    seen.add(id);
    if (!(await accountStore.getPlayer(id))) {
      return { ok: false, msg: `playerId ${id} 不存在，请先调用 Client_CreateTagPlatform` };
    }
  }
  return { ok: true };
}

async function handleSaveAccounts(accounts, userId) {
  const checked = await validateAccountRows(accounts);
  if (!checked.ok)
    return checked;
  const normalized = accounts.map(row => enrichAccountRowFromPlayer(row));
  for (const row of normalized) {
    const id = Number(row?.accountId ?? row?.AccountId);
    const label = String(row?.platformName ?? row?.PlatformName ?? "").trim();
    if (id && label) {
      await accountStore.syncPlayerDisplayName(id, label);
    }
  }
  store.setAccountsForUser(userId, normalized);
  return { ok: true, info: true };
}

async function handleSaveData(key, content, userId) {
  if (key === "ACCOUNT") {
    let accounts = [];
    try {
      accounts = content ? JSON.parse(content) : [];
    }
    catch {
      return { ok: false, msg: "ACCOUNT JSON 无效" };
    }
    return handleSaveAccounts(accounts, userId);
  }
  if (store.isUserSettingKey(key)) {
    store.setUserSetting(userId, key, content ?? "");
    return { ok: true, info: true };
  }
  return { ok: true, info: true };
}

function handleGetData(key, userId) {
  if (key === "ACCOUNT") {
    const accounts = store.getAccountsForUser(userId);
    return { ok: true, info: accounts, direct: accounts };
  }

  const isUserScoped = store.isUserSettingKey(key);
  const raw = isUserScoped ? store.getUserSetting(userId, key) : null;
  if (raw == null) {
    const empty = emptyDirectValue(key);
    if (empty !== null) {
      return { ok: true, info: empty, direct: empty };
    }
    return { ok: true, info: null, direct: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  }
  catch {
    parsed = raw;
  }

  if (Array.isArray(parsed)) {
    const rows
      = key === "ACCOUNT" ? parsed.map(row => enrichAccountRowFromPlayer(row)) : parsed;
    return { ok: true, info: rows, direct: rows };
  }
  if (parsed && typeof parsed === "object") {
    const direct = isUserScoped ? parsed : wrapObjectDirect(parsed);
    return { ok: true, info: parsed, direct };
  }
  if (isArrayKey(key)) {
    return { ok: true, info: [], direct: [] };
  }
  return { ok: true, info: parsed, direct: parsed };
}

async function refreshAccountBalance(accountRow) {
  const enriched = enrichAccountFromPlatformDefaults(accountRow);
  if (!enriched.gateway || !enriched.token) {
    return { account: enriched, balance: null };
  }
  try {
    const bal = await getAccountBalance(enriched);
    if (!bal)
      return { account: enriched, balance: null };
    if (enriched.accountId) {
      await accountStore.updatePlayerBalance(enriched.accountId, bal.balance);
    }
    return { account: enriched, balance: bal };
  }
  catch {
    return { account: enriched, balance: null };
  }
}

async function refreshAllAccountBalances(userId) {
  const accounts = userId ? store.getAccountsForUser(userId) : accountStore.getAccountsFromKv();
  const results = [];
  for (const row of accounts) {
    results.push(await refreshAccountBalance(row));
  }
  return results;
}

async function handleGetUserProfit() {
  const rows = await orderStore.listUserProfitRank();
  return { ok: true, info: rows };
}

async function handleGetOrderList(body, userId) {
  const date = body.date || orderStore.toDateKey(Date.now());
  const pageSize = Number(body.pageSize) || 1024;
  const pageIndex = Number(body.pageIndex) || 1;
  const all = await orderStore.listByDate(date, userId);
  const start = (pageIndex - 1) * pageSize;
  const list = all.slice(start, start + pageSize);
  return {
    ok: true,
    info: { list, total: all.length, pageIndex, pageSize },
  };
}

async function handleSaveOrderBind(body, userId) {
  let orders = body.orders;
  if (typeof orders === "string") {
    try {
      orders = JSON.parse(orders);
    }
    catch {
      return { ok: false, msg: "orders JSON 无效" };
    }
  }
  if (!Array.isArray(orders))
    return { ok: false, msg: "orders 必须是数组" };
  const bound = await orderStore.saveOrderBind(orders, userId);
  if (!bound)
    return { ok: false, msg: "绑单失败（订单不存在或 link 更新失败）" };
  return { ok: true, info: true };
}

function syncAccountRowInKv(accountId, updates, userId) {
  const list = userId ? store.getAccountsForUser(userId) : accountStore.getAccountsFromKv();
  const idx = list.findIndex(row => String(row.accountId) === String(accountId));
  if (idx < 0)
    return null;
  list[idx] = { ...list[idx], ...updates, updateTime: Date.now() };
  if (userId)
    store.setAccountsForUser(userId, list);
  return list[idx];
}

async function handleRefreshAccountBalance(body, userId) {
  const playerId = body.playerId;
  if (!playerId)
    return { ok: false, msg: "playerId 必填" };
  const accounts = userId ? store.getAccountsForUser(userId) : accountStore.getAccountsFromKv();
  const row = enrichAccountRowFromPlayer(
    accounts.find(r => String(r.accountId) === String(playerId)),
  );
  if (!row)
    return { ok: false, msg: "account 不存在" };
  const result = await refreshAccountBalance(row);
  if (result.balance != null) {
    const balance = Number(result.balance.balance) || 0;
    const credit = Number(row.credit) || 0;
    const synced = syncAccountRowInKv(playerId, {
      balance,
      currency: result.balance.currency || row.currency || "CNY",
      totalProfit: balance - credit,
    }, userId);
    return { ok: true, info: { ...synced, balance } };
  }
  return { ok: true, info: { ...row, balance: undefined } };
}

async function handleSaveUserLog(body, userId) {
  if (!userId)
    return { ok: false, msg: "请先登录" };
  const title = String(body.title || "").trim();
  if (!title)
    return { ok: false, msg: "title 必填" };
  let data = "";
  if (body.data != null) {
    data = typeof body.data === "string" ? body.data : JSON.stringify(body.data);
  }
  else if (body.rows != null) {
    data = typeof body.rows === "string" ? body.rows : JSON.stringify(body.rows);
  }
  const ok = await accountStore.saveUserLog(userId, title, data);
  return ok ? { ok: true, info: true } : { ok: false, msg: "写入用户日志失败" };
}

export {
  emptyPage,
  handleCreateTagPlatform,
  handleDeleteMoneyLog,
  handleDeletePlayer,
  handleGetData,
  handleGetMoneyLog,
  handleGetMoneyLogs,
  handleGetOrderList,
  handleGetPlayerOrder,
  handleGetTagPlatforms,
  handleGetUserProfit,
  handleGetUsers,
  handleRefreshAccountBalance,
  handleSaveAccounts,
  handleSaveData,
  handleSaveMoneyLog,
  handleSaveOrder,
  handleSaveOrderBind,
  handleSaveUserLog,
  handleUpdateBalance,
  refreshAccountBalance,
  refreshAllAccountBalances,
  syncAccountRowInKv,
};
