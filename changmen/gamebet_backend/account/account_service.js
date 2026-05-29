"use strict";

const accountStore = require("./account_store.js");
const orderStore = require("./order_store.js");
const { getAccountBalance, enrichAccountFromPlatformDefaults } = require("./balance_provider.js");
const { emptyPage } = require("../esport-api/stubs.js");
const {
  isArrayKey,
  emptyDirectValue,
  wrapObjectDirect,
} = require("../esport-api/user_kv.js");

function handleCreateTagPlatform(body) {
  const platformName = body.platform || body.platformName || "";
  const playerName = body.playerName || "";
  if (!platformName || !playerName) {
    return { ok: false, msg: "platform 与 playerName 必填" };
  }
  const created = accountStore.createTagPlatform(platformName, playerName);
  return { ok: true, info: created };
}

function handleGetTagPlatforms() {
  return { ok: true, info: accountStore.listTagPlatforms() };
}

function handleUpdateBalance(body) {
  const playerId = body.playerId;
  const balance = Number(body.balance);
  if (!playerId || Number.isNaN(balance)) {
    return { ok: false, msg: "playerId 与 balance 必填" };
  }
  const player = accountStore.getPlayer(playerId);
  if (!player) {
    return { ok: false, msg: "player 不存在" };
  }
  const info = accountStore.updatePlayerBalance(playerId, balance);
  return { ok: true, info };
}

function handleDeletePlayer(body) {
  const playerId = body.playerId;
  if (!playerId) return { ok: false, msg: "playerId 必填" };
  const ok = accountStore.deletePlayer(playerId, body.description || "");
  return ok ? { ok: true, info: true } : { ok: false, msg: "player 不存在" };
}

function handleGetMoneyLogs(body) {
  const playerId = body.playerId;
  if (!playerId) return { ok: false, msg: "playerId 必填" };
  const pageIndex = Number(body.pageIndex) || 1;
  const pageSize = Number(body.pageSize) || 20;
  return { ok: true, info: accountStore.listMoneyLogs(playerId, pageIndex, pageSize) };
}

function handleGetMoneyLog(body) {
  const row = accountStore.getMoneyLog(body.logId);
  return { ok: true, info: row };
}

function handleSaveMoneyLog(body) {
  const row = accountStore.saveMoneyLog(body);
  return { ok: true, info: row };
}

function handleDeleteMoneyLog(body) {
  const ok = accountStore.deleteMoneyLog(body.logId);
  return ok ? { ok: true, info: true } : { ok: false, msg: "log 不存在" };
}

function handleGetPlayerOrder(body) {
  const playerId = body.playerId;
  if (!playerId) return { ok: false, msg: "playerId 必填" };
  const orderStore = require("./order_store.js");
  orderStore.ensureSeed();
  const page = accountStore.listMoneyLogs(playerId, 1, 10000);
  const logs = (page.data || []).map((row) => ({
    ID: row.logId,
    Type: row.type,
    Money: Number(row.money) || 0,
    Currency: row.currency || "CNY",
    Description: row.description || "",
    IsAuto: /\d+sec|\d+s$/i.test(row.description || "") ? 1 : 0,
    CreateAt: row.createAt || 0,
  }));
  const orders = orderStore.listByPlayer(playerId);
  return { ok: true, info: { logs, orders } };
}

function handleSaveOrder(body) {
  const playerId = body.playerId;
  if (!playerId) return { ok: false, msg: "playerId 必填" };
  let orders = [];
  try {
    orders = JSON.parse(body.orders || "[]");
  } catch {
    return { ok: false, msg: "orders JSON 无效" };
  }
  accountStore.savePlayerOrders(playerId, body.type || body.provider || "", orders);
  return { ok: true, info: true };
}

function handleGetUsers() {
  const store = require("../esport-api/store.js");
  const users = store.readJson("users", []);
  const sessions = store.readJson("sessions", {});
  const now = Date.now();
  const onlineWindowMs = 30 * 60 * 1000;
  const onlineIds = new Set();
  for (const session of Object.values(sessions)) {
    if (!session?.userId) continue;
    if (now - Number(session.createdAt || 0) < onlineWindowMs) {
      onlineIds.add(session.userId);
    }
  }
  const info = users.map((u) => ({
    userId: u.id,
    userName: u.userName || "",
    isOnline: onlineIds.has(u.id) ? 1 : 0,
  }));
  return { ok: true, info };
}

/** 仅用于服务端 Refresh 对比；A8 不在 GetData 时注入余额 */
function resolveStoredBalance(row) {
  if (!row) return null;
  if (row.balance != null && row.balance !== 0) return Number(row.balance);
  const player = row.accountId ? accountStore.getPlayer(row.accountId) : null;
  if (player?.totalBalance != null && player.totalBalance !== 0) {
    return Number(player.totalBalance);
  }
  return row.balance != null ? Number(row.balance) : null;
}

/** A8 Io.loadAccounts：ACCOUNT 原样返回，不在加载时填 balance */
function enrichAccountRowFromPlayer(row) {
  return row;
}

function handleGetData(key) {
  const raw = require("../esport-api/store.js").getUserKv(key);
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
  } catch {
    parsed = raw;
  }

  if (Array.isArray(parsed)) {
    const rows =
      key === "ACCOUNT" ? parsed.map((row) => enrichAccountRowFromPlayer(row)) : parsed;
    return { ok: true, info: rows, direct: rows };
  }
  if (parsed && typeof parsed === "object") {
    const direct = wrapObjectDirect(parsed);
    return { ok: true, info: parsed, direct };
  }
  if (isArrayKey(key)) {
    return { ok: true, info: [], direct: [] };
  }
  return { ok: true, info: parsed, direct: parsed };
}

function normalizeBalanceError(message) {
  const text = String(message || "").trim();
  if (!text) return "token error";
  const lower = text.toLowerCase();
  if (/token|auth|unauthorized|401|403|login|credential|redis:\s*nil|invalid session/.test(lower)) {
    return "token error";
  }
  return text;
}

async function refreshAccountBalance(accountRow) {
  const enriched = enrichAccountFromPlatformDefaults(accountRow);
  if (!enriched.gateway || !enriched.token) {
    return { account: enriched, balance: null, error: "token error" };
  }
  try {
    const bal = await getAccountBalance(enriched);
    if (!bal) return { account: enriched, balance: null };
    if (enriched.accountId) {
      accountStore.updatePlayerBalance(enriched.accountId, bal.balance);
    }
    return { account: enriched, balance: bal };
  } catch (err) {
    return {
      account: enriched,
      balance: null,
      error: normalizeBalanceError(err.message),
    };
  }
}

async function refreshAllAccountBalances() {
  const accounts = accountStore.getAccountsFromKv();
  const results = [];
  for (const row of accounts) {
    results.push(await refreshAccountBalance(row));
  }
  return results;
}

function handleGetOrderList(body) {
  orderStore.ensureSeed();
  const date = body.date || orderStore.toDateKey(Date.now());
  const pageSize = Number(body.pageSize) || 1024;
  const pageIndex = Number(body.pageIndex) || 1;
  const all = orderStore.listByDate(date);
  const start = (pageIndex - 1) * pageSize;
  const list = all.slice(start, start + pageSize);
  return {
    ok: true,
    info: { list, total: all.length, pageIndex, pageSize },
  };
}

function handleSaveOrderBind(body) {
  orderStore.ensureSeed();
  let orders = body.orders;
  if (typeof orders === "string") {
    try {
      orders = JSON.parse(orders);
    } catch {
      return { ok: false, msg: "orders JSON 无效" };
    }
  }
  if (!Array.isArray(orders)) return { ok: false, msg: "orders 必须是数组" };
  orderStore.saveOrderBind(orders);
  return { ok: true, info: true };
}

function syncAccountRowInKv(accountId, updates) {
  const list = accountStore.getAccountsFromKv();
  const idx = list.findIndex((row) => String(row.accountId) === String(accountId));
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...updates, updateTime: Date.now() };
  require("../esport-api/store.js").setUserKv("ACCOUNT", JSON.stringify(list));
  return list[idx];
}

async function handleRefreshAccountBalance(body) {
  const playerId = body.playerId;
  if (!playerId) return { ok: false, msg: "playerId 必填" };
  const accounts = accountStore.getAccountsFromKv();
  const row = enrichAccountRowFromPlayer(
    accounts.find((r) => String(r.accountId) === String(playerId)),
  );
  if (!row) return { ok: false, msg: "account 不存在" };
  const previousBalance = resolveStoredBalance(row);
  const result = await refreshAccountBalance(row);
  if (result.balance != null) {
    const balance = Number(result.balance.balance) || 0;
    if (balance === 0 && previousBalance != null && previousBalance > 0) {
      return {
        ok: true,
        info: {
          ...row,
          balanceError: "token error",
        },
      };
    }
    const credit = Number(row.credit) || 0;
    const synced = syncAccountRowInKv(playerId, {
      balance,
      currency: result.balance.currency || row.currency || "CNY",
      totalProfit: balance - credit,
    });
    return { ok: true, info: { ...synced, balanceError: null } };
  }
  const balanceError = result.error || "token error";
  return {
    ok: true,
    info: {
      ...row,
      balanceError,
    },
  };
}

module.exports = {
  handleCreateTagPlatform,
  handleGetTagPlatforms,
  handleUpdateBalance,
  handleDeletePlayer,
  handleGetMoneyLogs,
  handleGetMoneyLog,
  handleSaveMoneyLog,
  handleDeleteMoneyLog,
  handleGetPlayerOrder,
  handleSaveOrder,
  handleGetOrderList,
  handleSaveOrderBind,
  handleGetUsers,
  handleGetData,
  refreshAccountBalance,
  refreshAllAccountBalances,
  handleRefreshAccountBalance,
  syncAccountRowInKv,
  emptyPage,
};
