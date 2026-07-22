/**
 * PredictFun 服务端权威写单（RDS）。
 *
 * 与用户 `Client_SaveOrder` 无关：前端对 PF 已 skip，后端 handleSaveOrder 已拒。
 * 仓位 / fee / 状态 / 回款仅允许经 Pf_* → 本函数落库。
 */

import * as orderStore from "../../account/order_store.js";

/**
 * @param {number|string} playerId
 * @param {object[]} orders
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function upsertPfServerOrder(playerId, orders, userId) {
  return orderStore.saveOrder(playerId, orders, userId, "PredictFun");
}
