/**
 * changmen 投注账号归属：每个 players 行必须 owner_user_id === 当前登录用户。
 * A8 前端只传 playerId；隔离由后端保证（非 A8 黑盒后端复刻）。
 */
import * as accountStore from "./account_store.js";

export async function assertPlayerOwnedByUser(playerId, userId) {
  if (!userId)
    return { ok: false, msg: "请先登录" };
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0)
    return { ok: false, msg: "playerId 无效" };
  const player = await accountStore.getPlayer(id);
  if (!player)
    return { ok: false, msg: `playerId ${id} 不存在，请先调用 Client_CreateTagPlatform` };
  if (!player.ownerUserId)
    return { ok: false, msg: `playerId ${id} 未完成归属迁移，拒绝操作` };
  if (player.ownerUserId !== String(userId))
    return { ok: false, msg: `playerId ${id} 不属于当前用户` };
  return { ok: true, player };
}
