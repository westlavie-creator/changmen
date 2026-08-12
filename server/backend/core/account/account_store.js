import * as sb from "@changmen/db";
import {
  VenueAccountKeyConflictError,
  buildVenueAccountKey,
  venueAccountKeyConflictMessage,
} from "@changmen/db/venue_account_key.js";
import store from "../esport-api/store.js";

async function listTagPlatforms() {
  const rows = await sb.fetchTagPlatforms();
  return rows
    .map(row => ({ ID: Number(row.id), Name: String(row.name) }))
    .sort((a, b) => a.ID - b.ID);
}

async function createTagPlatform(platformName, playerName, ownerUserId, opts = {}) {
  const label = String(platformName || "").trim();
  const name = String(playerName || "").trim();
  const uid = String(ownerUserId || "").trim();
  const venueMemberId = String(opts.venueMemberId || "").trim();
  const provider = String(opts.provider || "").trim();
  if (!label || !uid)
    return null;
  if (!venueMemberId && !name)
    return null;
  if (venueMemberId && !provider)
    throw new Error("CreateTagPlatform 需要 provider 与 venueMemberId 配套");
  if (!uid)
    throw new Error("CreateTagPlatform 需要登录用户 ownerUserId");

  const platform = await sb.upsertTagPlatformByName(label);
  if (!platform) {
    throw new Error("CreateTagPlatform 需要 DATABASE_URL（RDS tag_platforms / players）");
  }

  const displayName = name || venueMemberId;
  const venueKey = venueMemberId && provider
    ? buildVenueAccountKey({ provider, venueMemberId })
    : "";

  function toCreated(player) {
    return {
      playerId: player.playerId ?? player.id,
      playerName: player.playerName,
      platformId: player.platformId ?? platform.id,
      platformName: platform.name,
      venueMemberId: player.venueMemberId || venueMemberId || undefined,
      provider: player.provider || provider || undefined,
    };
  }

  async function resurrectIfNeeded(row) {
    if (!row)
      return null;
    if (!row.deletedAt)
      return toCreated(row);
    const revived = await sb.resurrectPlayerRow(row.playerId ?? row.id, uid, {
      platformId: platform.id,
      platformName: platform.name,
      playerName: displayName,
      provider,
      venueMemberId,
    });
    if (!revived)
      throw new Error("CreateTagPlatform 复活已删账号失败");
    return toCreated(revived);
  }

  /** 按名命中的软删行若场馆会员 ID 不同，禁止误复活成另一场馆号 */
  function canReuseByIdentity(row) {
    if (!row)
      return false;
    if (!venueMemberId)
      return true;
    const existingMember = String(row.venueMemberId || "").trim();
    if (!existingMember)
      return true;
    return existingMember === venueMemberId;
  }

  // 含软删指纹占坑：他人占用（含已删）→ 拒绝；本人已删 → 复活
  // [P0-4 D4] 冲突查询用 strict：读失败不得当「无占用」继续 insert
  if (venueKey) {
    let holder;
    try {
      holder = await sb.fetchPlayerByVenueAccountKeyStrict(venueKey);
    }
    catch (err) {
      console.error("[account] fetchPlayerByVenueAccountKeyStrict 失败，已中止建号:", err?.message);
      throw new Error("场馆账号占用检查失败，请稍后重试（已阻止添加）");
    }
    if (holder) {
      if (String(holder.ownerUserId) !== uid) {
        let detailed;
        try {
          detailed = await sb.findVenueAccountKeyConflictStrict(venueKey);
        }
        catch (err) {
          console.error("[account] findVenueAccountKeyConflictStrict 失败，已中止建号:", err?.message);
          throw new Error("场馆账号占用检查失败，请稍后重试（已阻止添加）");
        }
        const conflict = detailed || {
          id: holder.playerId ?? holder.id,
          ownerUserId: holder.ownerUserId,
          deletedAt: holder.deletedAt,
          deleted: holder.deletedAt != null,
        };
        throw new VenueAccountKeyConflictError(
          venueAccountKeyConflictMessage(conflict),
          conflict,
        );
      }
      return resurrectIfNeeded(holder);
    }
  }

  // [changmen 扩展] 接线场馆优先按 provider + venueMemberId（含本人软删）
  let existing = null;
  if (venueMemberId && provider) {
    existing = await sb.fetchPlayerByProviderAndVenueMemberId(
      provider,
      venueMemberId,
      uid,
      { includeDeleted: true },
    );
  }
  if (!existing && name) {
    const byName = await sb.fetchPlayerByPlatformAndName(platform.id, name, uid, {
      includeDeleted: true,
    })
      || await sb.fetchPlayerByPlatformNameAndPlayerName(label, name, uid, {
        includeDeleted: true,
      });
    if (canReuseByIdentity(byName))
      existing = byName;
  }
  if (existing)
    return resurrectIfNeeded(existing);

  const player = await sb.insertPlayerRow({
    platformId: platform.id,
    platformName: platform.name,
    playerName: displayName,
    ownerUserId: uid,
    provider,
    venueMemberId,
  });
  if (!player) {
    const raced = (venueMemberId && provider
      ? await sb.fetchPlayerByProviderAndVenueMemberId(provider, venueMemberId, uid, {
        includeDeleted: true,
      })
      : null)
      || (name
        ? await sb.fetchPlayerByPlatformAndName(platform.id, name, uid, { includeDeleted: true })
          || await sb.fetchPlayerByPlatformNameAndPlayerName(label, name, uid, {
            includeDeleted: true,
          })
        : null);
    if (raced && canReuseByIdentity(raced))
      return resurrectIfNeeded(raced);
    throw new Error("CreateTagPlatform 写入 players 失败");
  }

  return toCreated(player);
}

async function getPlayer(playerId) {
  const row = await sb.fetchPlayerById(playerId);
  if (!row)
    return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId ?? null,
    platformId: row.platformId,
    platformName: row.platformName,
    playerName: row.playerName,
    credit: row.credit,
    totalBalance: row.totalBalance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function updatePlayerBalance(playerId, balance, ownerUserId) {
  return sb.updatePlayerBalanceRow(playerId, balance, ownerUserId);
}

/** PF 下单：条件扣减，余额不足返回 null */
async function debitPlayerBalance(playerId, amount, ownerUserId) {
  return sb.debitPlayerBalanceRow(playerId, amount, ownerUserId);
}

/** PF 卖出/结算：条件入账 */
async function creditPlayerBalance(playerId, amount, ownerUserId) {
  return sb.creditPlayerBalanceRow(playerId, amount, ownerUserId);
}

/** PF 管理端充值：余额 + 流水同事务 */
async function rechargePlayerBalanceWithMoneyLog(opts) {
  return sb.rechargePlayerBalanceWithMoneyLogRow(opts);
}

/** PF pending_credit：余额入账 + 订单标 credited（RDS 同事务） */
async function claimCreditPfPendingOrder(playerId, orderId, ownerUserId) {
  return sb.claimCreditPfPendingOrderRow(playerId, orderId, ownerUserId);
}

/** PF 卖出迟到 fee：同事务校正 proceeds + 余额 delta（或改写 pending_credit） */
async function adjustPfSellProceedsAfterFee(playerId, ownerUserId, params) {
  return sb.adjustPfSellProceedsAfterFeeRow(playerId, ownerUserId, params);
}

/** ACCOUNT 保存时同步显示用 platform_name（余额刷新会从 players 读回） */
async function syncPlayerDisplayName(playerId, platformName, ownerUserId) {
  return sb.updatePlayerDisplayName(playerId, platformName, ownerUserId);
}

async function batchSyncPlayerDisplayNames(updates, ownerUserId) {
  const count = await sb.batchUpdatePlayerDisplayNames(ownerUserId, updates);
  return count > 0;
}

async function saveUserLog(userId, title, data) {
  return sb.insertUserLogRow(userId, title, data);
}

async function deletePlayer(playerId, description, ownerUserId) {
  const ok = await sb.softDeletePlayerRow(playerId, description, ownerUserId);
  if (!ok)
    return false;

  removeAccountFromKv();
  return true;
}

async function deletePlayerData(playerId, userId) {
  await sb.deleteMoneyLogsByPlayer(playerId, userId);
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
      if (String(err?.code) === "23514" || /owner_user_id|players_active_requires_owner/i.test(String(err.message))) {
        _playersMigrateDone = true;
      }
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
  await runPlayersJsonMigrateOnce();
  const { migrateLegacySessionsJsonToRds } = await import("./user_presence.js");
  await migrateLegacySessionsJsonToRds();
}

async function prunePlayersNotInList(ownerUserId, keepPlayerIds) {
  return sb.softDeletePlayersNotInList(ownerUserId, keepPlayerIds);
}

export {
  createTagPlatform,
  deleteMoneyLog,
  deletePlayer,
  deletePlayerData,
  ensureSeed,
  getAccountsFromKv,
  getMoneyLog,
  getPlayer,
  listMoneyLogs,
  listTagPlatforms,
  batchSyncPlayerDisplayNames,
  prunePlayersNotInList,
  removeAccountFromKv,
  saveMoneyLog,
  saveUserLog,
  syncPlayerDisplayName,
  updatePlayerBalance,
  debitPlayerBalance,
  creditPlayerBalance,
  rechargePlayerBalanceWithMoneyLog,
  claimCreditPfPendingOrder,
  adjustPfSellProceedsAfterFee,
};
