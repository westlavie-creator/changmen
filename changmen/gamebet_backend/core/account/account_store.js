"use strict";

const store = require("../esport-api/store.js");

const FILES = {
  tagPlatforms: "tag_platforms",
  players: "players",
  moneyLogs: "money_logs",
  playerOrders: "player_orders",
};

function nextId(collection) {
  let max = 0;
  for (const row of Object.values(collection || {})) {
    const id = Number(row.id ?? row.ID ?? row.playerId ?? 0);
    if (id > max) max = id;
  }
  return max + 1;
}

function listTagPlatforms() {
  const all = store.readJson(FILES.tagPlatforms, {});
  return Object.values(all)
    .map((row) => ({ ID: row.id, Name: row.name }))
    .sort((a, b) => a.ID - b.ID);
}

function findTagPlatformByName(name) {
  const all = store.readJson(FILES.tagPlatforms, {});
  return Object.values(all).find((row) => row.name === name) || null;
}

function createTagPlatform(platformName, playerName) {
  const platforms = store.readJson(FILES.tagPlatforms, {});
  const players = store.readJson(FILES.players, {});

  let platform = findTagPlatformByName(platformName);
  if (!platform) {
    const id = nextId(platforms);
    platform = { id, name: platformName, createdAt: Date.now() };
    platforms[id] = platform;
  }

  const playerId = nextId(players);
  const player = {
    id: playerId,
    platformId: platform.id,
    platformName: platform.name,
    playerName: playerName || "",
    credit: 0,
    totalBalance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  players[playerId] = player;

  store.writeJson(FILES.tagPlatforms, platforms);
  store.writeJson(FILES.players, players);

  return {
    playerId,
    playerName: player.playerName,
    platformId: platform.id,
    platformName: platform.name,
  };
}

function getPlayer(playerId) {
  const players = store.readJson(FILES.players, {});
  return players[String(playerId)] || null;
}

function updatePlayerBalance(playerId, balance) {
  const players = store.readJson(FILES.players, {});
  const key = String(playerId);
  const row = players[key];
  if (!row) return null;

  row.totalBalance = Number(balance) || 0;
  row.updatedAt = Date.now();
  players[key] = row;
  store.writeJson(FILES.players, players);

  const platforms = store.readJson(FILES.tagPlatforms, {});
  const platform = platforms[String(row.platformId)];

  return {
    total: row.totalBalance,
    platformId: row.platformId,
    platformName: platform?.name || row.platformName || "",
    credit: row.credit || 0,
  };
}

function deletePlayer(playerId, description) {
  const players = store.readJson(FILES.players, {});
  const key = String(playerId);
  if (!players[key]) return false;

  players[key] = {
    ...players[key],
    deletedAt: Date.now(),
    deleteDescription: description || "",
  };
  store.writeJson(FILES.players, players);

  const orders = store.readJson(FILES.playerOrders, {});
  delete orders[key];
  store.writeJson(FILES.playerOrders, orders);

  const logs = store.readJson(FILES.moneyLogs, {});
  for (const [logId, row] of Object.entries(logs)) {
    if (String(row.playerId) === key) delete logs[logId];
  }
  store.writeJson(FILES.moneyLogs, logs);

  removeAccountFromKv(key);
  return true;
}

function removeAccountFromKv() {}

function listMoneyLogs(playerId, pageIndex = 1, pageSize = 20) {
  const all = store.readJson(FILES.moneyLogs, {});
  const list = Object.values(all)
    .filter((row) => String(row.playerId) === String(playerId))
    .sort((a, b) => (b.createAt || 0) - (a.createAt || 0));

  const start = (pageIndex - 1) * pageSize;
  return {
    list: list.slice(start, start + pageSize),
    data: list,
    total: list.length,
    RecordCount: list.length,
    pageIndex,
    pageSize,
  };
}

function getMoneyLog(logId) {
  const all = store.readJson(FILES.moneyLogs, {});
  return all[String(logId)] || null;
}

function saveMoneyLog(payload) {
  const all = store.readJson(FILES.moneyLogs, {});
  const logId = payload.logId || nextId(all);
  const row = {
    logId,
    playerId: payload.playerId,
    type: payload.type || "Recharge",
    money: Number(payload.money) || 0,
    description: payload.description || "",
    createAt: payload.createAt || Date.now(),
    updatedAt: Date.now(),
  };
  all[String(logId)] = row;
  store.writeJson(FILES.moneyLogs, all);
  return row;
}

function deleteMoneyLog(logId) {
  const all = store.readJson(FILES.moneyLogs, {});
  if (!all[String(logId)]) return false;
  delete all[String(logId)];
  store.writeJson(FILES.moneyLogs, all);
  return true;
}

function getPlayerOrders(playerId) {
  const all = store.readJson(FILES.playerOrders, {});
  return all[String(playerId)]?.orders || [];
}

function savePlayerOrders(playerId, provider, orders) {
  const all = store.readJson(FILES.playerOrders, {});
  const key = String(playerId);
  const prev = all[key]?.orders || [];
  const merged = [...prev];

  for (const order of orders || []) {
    const idx = merged.findIndex(
      (row) => row.orderId === order.orderId && row.provider === (order.provider || provider)
    );
    if (idx >= 0) merged[idx] = { ...merged[idx], ...order };
    else merged.push({ ...order, provider: order.provider || provider });
  }

  all[key] = { playerId: key, orders: merged, updatedAt: Date.now() };
  store.writeJson(FILES.playerOrders, all);
  return merged;
}

function getAccountsFromKv() { return []; }

function ensureSeed() {
  store.ensureSeed();
  for (const name of Object.values(FILES)) {
    if (store.readJson(name, null) == null) store.writeJson(name, {});
  }
}

module.exports = {
  FILES,
  ensureSeed,
  listTagPlatforms,
  createTagPlatform,
  getPlayer,
  updatePlayerBalance,
  deletePlayer,
  listMoneyLogs,
  getMoneyLog,
  saveMoneyLog,
  deleteMoneyLog,
  getPlayerOrders,
  savePlayerOrders,
  getAccountsFromKv,
  removeAccountFromKv,
};
