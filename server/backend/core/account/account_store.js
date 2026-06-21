import * as sb from "@changmen/db";
import store from "../esport-api/store.js";

const FILES = {
  playerOrders: "player_orders",
};

async function listTagPlatforms() {
  const rows = await sb.fetchTagPlatforms();
  return rows
    .map(row => ({ ID: Number(row.id), Name: String(row.name) }))
    .sort((a, b) => a.ID - b.ID);
}

async function createTagPlatform(platformName, playerName) {
  const label = String(platformName || "").trim();
  const name = String(playerName || "").trim();
  if (!label || !name)
    return null;

  const platform = await sb.upsertTagPlatformByName(label);
  if (!platform) {
    throw new Error("CreateTagPlatform 需要 DATABASE_URL（RDS tag_platforms / players）");
  }

  const player = await sb.insertPlayerRow({
    platformId: platform.id,
    platformName: platform.name,
    playerName: name,
  });
  if (!player) {
    throw new Error("CreateTagPlatform 写入 players 失败");
  }

  return {
    playerId: player.id,
    playerName: player.playerName,
    platformId: player.platformId,
    platformName: player.platformName,
  };
}

async function getPlayer(playerId) {
  const row = await sb.fetchPlayerById(playerId);
  if (!row)
    return null;
  return {
    id: row.id,
    platformId: row.platformId,
    platformName: row.platformName,
    playerName: row.playerName,
    credit: row.credit,
    totalBalance: row.totalBalance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function updatePlayerBalance(playerId, balance) {
  return sb.updatePlayerBalanceRow(playerId, balance);
}

/** ACCOUNT 保存时同步显示用 platform_name（余额刷新会从 players 读回） */
async function syncPlayerDisplayName(playerId, platformName) {
  return sb.updatePlayerDisplayName(playerId, platformName);
}

async function saveUserLog(userId, title, data) {
  return sb.insertUserLogRow(userId, title, data);
}

async function deletePlayer(playerId, description) {
  const ok = await sb.softDeletePlayerRow(playerId, description);
  if (!ok)
    return false;

  const orders = store.readJson(FILES.playerOrders, {});
  delete orders[String(playerId)];
  store.writeJson(FILES.playerOrders, orders);

  removeAccountFromKv();
  return true;
}

async function deletePlayerData(playerId) {
  await sb.deleteMoneyLogsByPlayer(playerId);
}

function removeAccountFromKv() {}

function parseCreateAt(value) {
  if (typeof value === "number" && !Number.isNaN(value))
    return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
    if (!Number.isNaN(parsed))
      return parsed;
  }
  return Date.now();
}

function resolveIsAuto(payload, description, type) {
  if (type !== "Withdraw")
    return 0;
  if (payload.isAuto === true || payload.isAuto === 1 || payload.IsAuto === 1)
    return 1;
  return /\d+sec|\d+s$/i.test(description || "") ? 1 : 0;
}

/** A8 `Client_GetMoneyLog` / 表格行：PascalCase + 小写兼容字段 */
function normalizeMoneyLogRow(row) {
  if (!row)
    return null;
  const logId = Number(row.logId ?? row.ID ?? row.id) || 0;
  const type = row.type ?? row.Type ?? "Recharge";
  const description = row.description ?? row.Description ?? row.Remark ?? "";
  const currency = row.currency ?? row.Currency ?? "CNY";
  const money = Number(row.money ?? row.Money) || 0;
  const createAt = Number(row.createAt ?? row.CreateAt) || 0;
  const isAuto
    = row.isAuto === 1
      || row.isAuto === true
      || row.IsAuto === 1
      || (type === "Withdraw" && /\d+sec|\d+s$/i.test(description))
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
  if (!row)
    return null;
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
      row => row.orderId === order.orderId && row.provider === (order.provider || provider),
    );
    if (idx >= 0)
      merged[idx] = { ...merged[idx], ...order };
    else merged.push({ ...order, provider: order.provider || provider });
  }

  all[key] = { playerId: key, orders: merged, updatedAt: Date.now() };
  store.writeJson(FILES.playerOrders, all);
  return merged;
}

function getAccountsFromKv() { return []; }

let _playersMigrateDone = false;
/** @type {Promise<void> | null} */
let _playersMigrateInflight = null;

async function runPlayersJsonMigrateOnce() {
  if (_playersMigrateDone)
    return;
  if (_playersMigrateInflight) {
    await _playersMigrateInflight;
    return;
  }
  _playersMigrateInflight = (async () => {
    try {
      const result = await sb.migratePlayersJsonToRds();
      if (result?.ok || result?.skipped)
        _playersMigrateDone = true;
    }
    catch (err) {
      console.warn("[account_store] migratePlayersJsonToRds:", err.message);
      throw err;
    }
    finally {
      _playersMigrateInflight = null;
    }
  })();
  try {
    await _playersMigrateInflight;
  }
  catch {
    /* 迁移失败不阻塞 esport API；下次请求会重试 */
  }
}

async function ensureSeed() {
  store.ensureSeed();
  if (store.readJson(FILES.playerOrders, null) == null) {
    store.writeJson(FILES.playerOrders, {});
  }
  await runPlayersJsonMigrateOnce();
  const { migrateLegacySessionsJsonToRds } = await import("./user_presence.js");
  await migrateLegacySessionsJsonToRds();
}

export {
  createTagPlatform,
  deleteMoneyLog,
  deletePlayer,
  deletePlayerData,
  ensureSeed,
  FILES,
  getAccountsFromKv,
  getMoneyLog,
  getPlayer,
  getPlayerOrders,
  listMoneyLogs,
  listTagPlatforms,
  removeAccountFromKv,
  saveMoneyLog,
  savePlayerOrders,
  saveUserLog,
  syncPlayerDisplayName,
  updatePlayerBalance,
};
