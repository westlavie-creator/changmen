import store from "../esport-api/store.js";
import * as sb from "@changmen/db";

const FILES = {
  tagPlatforms: "tag_platforms",
  players: "players",
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

  removeAccountFromKv(key);
  return true;
}

async function deletePlayerData(playerId) {
  await sb.deleteMoneyLogsByPlayer(playerId);
}

function removeAccountFromKv() {}

function parseCreateAt(value) {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function resolveIsAuto(payload, description, type) {
  if (type !== "Withdraw") return 0;
  if (payload.isAuto === true || payload.isAuto === 1 || payload.IsAuto === 1) return 1;
  return /\d+sec|\d+s$/i.test(description || "") ? 1 : 0;
}

/** A8 `Client_GetMoneyLog` / 表格行：PascalCase + 小写兼容字段 */
function normalizeMoneyLogRow(row) {
  if (!row) return null;
  const logId = Number(row.logId ?? row.ID ?? row.id) || 0;
  const type = row.type ?? row.Type ?? "Recharge";
  const description = row.description ?? row.Description ?? row.Remark ?? "";
  const currency = row.currency ?? row.Currency ?? "CNY";
  const money = Number(row.money ?? row.Money) || 0;
  const createAt = Number(row.createAt ?? row.CreateAt) || 0;
  const isAuto =
    row.isAuto === 1 ||
    row.isAuto === true ||
    row.IsAuto === 1 ||
    (type === "Withdraw" && /\d+sec|\d+s$/i.test(description))
      ? 1
      : 0;
  return {
    logId,
    ID: logId,
    playerId: row.playerId ?? row.PlayerID,
    PlayerID: row.playerId ?? row.PlayerID,
    type,
    Type: type,
    money,
    Money: money,
    currency,
    Currency: currency,
    description,
    Description: description,
    Remark: description,
    isAuto,
    IsAuto: isAuto,
    createAt,
    CreateAt: createAt,
    updatedAt: row.updatedAt,
  };
}

function dbRowToMoneyLog(row) {
  if (!row) return null;
  return normalizeMoneyLogRow({
    logId: row.id,
    playerId: row.player_id,
    type: row.type,
    money: row.money,
    currency: row.currency,
    description: row.description,
    isAuto: row.is_auto,
    createAt: row.create_at,
    updatedAt: row.updated_at,
  });
}

async function listMoneyLogs(playerId, pageIndex = 1, pageSize = 20, userId) {
  const rows = await sb.fetchMoneyLogsByPlayer(playerId, userId);
  const list = rows.map(dbRowToMoneyLog).filter(Boolean);
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

async function getMoneyLog(logId, userId) {
  const row = await sb.fetchMoneyLogById(logId, userId);
  return dbRowToMoneyLog(row);
}

async function saveMoneyLog(payload, userId) {
  const logId = Number(payload.logId ?? payload.ID) || 0;
  const type = payload.type ?? payload.Type ?? "Recharge";
  const description = payload.description ?? payload.Description ?? "";
  const saved = await sb.upsertMoneyLog({
    id: logId > 0 ? logId : undefined,
    user_id: userId,
    player_id: Number(payload.playerId ?? payload.PlayerID),
    type,
    money: Number(payload.money ?? payload.Money) || 0,
    currency: payload.currency ?? payload.Currency ?? "CNY",
    description,
    is_auto: resolveIsAuto(payload, description, type),
    create_at: parseCreateAt(payload.createAt ?? payload.CreateAt),
  });
  return dbRowToMoneyLog(saved);
}

async function deleteMoneyLog(logId, userId) {
  return sb.deleteMoneyLogById(logId, userId);
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

export {
  FILES,
  ensureSeed,
  listTagPlatforms,
  createTagPlatform,
  getPlayer,
  updatePlayerBalance,
  deletePlayer,
  deletePlayerData,
  listMoneyLogs,
  getMoneyLog,
  saveMoneyLog,
  deleteMoneyLog,
  getPlayerOrders,
  savePlayerOrders,
  getAccountsFromKv,
  removeAccountFromKv,
};
