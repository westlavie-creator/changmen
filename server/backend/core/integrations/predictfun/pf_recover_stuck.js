/**
 * PF 卡住订单恢复：pending_credit 入账 + closing 卖出补齐
 */

import { isPfSellClosing } from "./pf_lifecycle.js";
import { executePfSellInLock } from "./pf_exec_sell.js";
import {
  loadPfOrders,
  retryPendingPfLedgerCredits,
} from "./pf_player_account.js";
import { rdsOrderKey } from "./pf_order_row.js";
import { withHouseOrderLock } from "./pf_order_service.js";

/**
 * @returns {Promise<{
 *   pendingCredit: { creditedCount: number, creditedUsdt: number },
 *   closing: Array<{ buyOrderId: string, ok: boolean, msg?: string, info?: object }>,
 * }>}
 */
export async function recoverPfStuckOrdersForPlayer(playerId, userId) {
  const pendingCredit = await retryPendingPfLedgerCredits(playerId, userId);
  const list = await loadPfOrders(playerId, userId);
  const closingRows = list.filter(isPfSellClosing);
  /** @type {Array<{ buyOrderId: string, ok: boolean, msg?: string, info?: object }>} */
  const closing = [];

  for (const buy of closingRows) {
    const buyOrderId = rdsOrderKey(buy);
    if (!buyOrderId) {
      closing.push({ buyOrderId: "", ok: false, msg: "买单缺 orderId" });
      continue;
    }
    try {
      const info = await withHouseOrderLock(() => executePfSellInLock({
        playerId,
        userId,
        buyOrderId,
      }));
      closing.push({ buyOrderId, ok: true, info });
    }
    catch (err) {
      closing.push({
        buyOrderId,
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { pendingCredit, closing };
}

/** 只列出卡住项（不执行补偿） */
export async function listPfStuckOrdersForPlayer(playerId, userId) {
  const list = await loadPfOrders(playerId, userId);
  const pendingCredit = list
    .filter((row) => String(row.pfLedgerState ?? "").toLowerCase() === "pending_credit")
    .map((row) => ({
      orderId: rdsOrderKey(row),
      pfSellState: row.pfSellState,
      pfPendingCreditUsdt: row.pfPendingCreditUsdt,
      status: row.status ?? row.Status,
    }));
  const closing = list.filter(isPfSellClosing).map((row) => ({
    orderId: rdsOrderKey(row),
    pfSellOrderId: row.pfSellOrderId,
    pfHoldShares: row.pfHoldShares,
    status: row.status ?? row.Status,
  }));
  return { pendingCredit, closing };
}
