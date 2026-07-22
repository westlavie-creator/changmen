/**
 * PredictFun 会员余额 / 订单列表 / pending_credit 入账（账本侧，无官网 IO）
 */

import * as accountStore from "../../account/account_store.js";
import { rowToOrder } from "../../account/order_store.js";
import * as sb from "@changmen/db";
import store from "../../esport-api/store.js";
import {
  readChangmenCodeFeeRateBps,
  readChangmenCodeFeeShares,
  readChangmenCodeFeeUsdt,
} from "./pf_changmen_code_fee.js";
import { roundUsdt, summarizePfOrders } from "./pf_ledger.js";
import { readPfLedgerState, readPfPendingCreditUsdt } from "./pf_lifecycle.js";
import { rdsOrderKey } from "./pf_order_row.js";
import { withHouseOrderLock } from "./pf_order_service.js";
import { toUserPfBalanceInfo } from "./pf_user_dto.js";

/** 避免与 account_service 循环依赖：就地写 ACCOUNT 缓存行 */
export async function syncAccountRowInKv(accountId, updates, userId) {
  const list = userId ? store.getAccountsForUser(userId) : accountStore.getAccountsFromKv();
  const idx = list.findIndex(row => String(row.accountId) === String(accountId));
  if (idx < 0)
    return null;
  list[idx] = { ...list[idx], ...updates, updateTime: Date.now() };
  if (userId)
    await store.setAccountsForUser(userId, list);
  return list[idx];
}

/**
 * 读取余额；若历史误写在 credit 且 total_balance=0，一次性迁到 total_balance 并清零 credit
 */
export async function resolvePfBalance(player, userId, playerId) {
  let bal = roundUsdt(player?.totalBalance);
  const legacyCredit = roundUsdt(player?.credit);
  if (bal === 0 && legacyCredit > 0) {
    await accountStore.updatePlayerBalance(playerId, legacyCredit, userId);
    await syncAccountRowInKv(playerId, {
      balance: legacyCredit,
      credit: 0,
      currency: "USDT",
    }, userId);
    return legacyCredit;
  }
  return bal;
}

export async function loadPfOrders(playerId, userId) {
  const rows = await sb.fetchOrdersByPlayer(playerId, userId);
  return (rows || []).map((r) => {
    const base = rowToOrder(r);
    const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
    return {
      ...base,
      pfOrderHash: raw.pfOrderHash ? String(raw.pfOrderHash) : undefined,
      pfApiOrderId: raw.pfApiOrderId ? String(raw.pfApiOrderId) : undefined,
      pfRefundedAt: raw.pfRefundedAt ?? undefined,
      pfMarketId: raw.pfMarketId ? String(raw.pfMarketId) : undefined,
      pfTokenId: raw.pfTokenId ? String(raw.pfTokenId) : undefined,
      pfSharesWei: raw.pfSharesWei ? String(raw.pfSharesWei) : undefined,
      pfShares: raw.pfShares != null ? Number(raw.pfShares) : undefined,
      pfHoldShares: raw.pfHoldShares != null ? Number(raw.pfHoldShares) : undefined,
      pfNotionalUsdt: raw.pfNotionalUsdt != null ? Number(raw.pfNotionalUsdt) : undefined,
      pfFillCostUsdt: raw.pfFillCostUsdt != null ? Number(raw.pfFillCostUsdt) : undefined,
      pfBookPrice: raw.pfBookPrice != null ? Number(raw.pfBookPrice) : undefined,
      pfSellState: raw.pfSellState ? String(raw.pfSellState) : undefined,
      pfSide: raw.pfSide ? String(raw.pfSide) : undefined,
      pfBuyOrderId: raw.pfBuyOrderId ? String(raw.pfBuyOrderId) : undefined,
      pfFeeAmountWei: raw.pfFeeAmountWei ? String(raw.pfFeeAmountWei) : undefined,
      pfFeeType: raw.pfFeeType === "SHARES" || raw.pfFeeType === "COLLATERAL"
        ? raw.pfFeeType
        : undefined,
      pfFeeUsdt: raw.pfFeeUsdt != null && Number.isFinite(Number(raw.pfFeeUsdt))
        ? Number(raw.pfFeeUsdt)
        : undefined,
      pfFeeRateBps: (() => {
        const n = Number(raw.pfFeeRateBps);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      })(),
      pfSellOrderId: raw.pfSellOrderId ? String(raw.pfSellOrderId) : undefined,
      pfSellProceeds: (() => {
        const n = Number(raw.pfSellProceeds);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      })(),
      pfChangmenCodeFeeRateBps: readChangmenCodeFeeRateBps(raw),
      pfChangmenCodeFeeShares: readChangmenCodeFeeShares(raw),
      pfChangmenCodeFeeUsdt: readChangmenCodeFeeUsdt(raw),
      pfLedgerState: raw.pfLedgerState ? String(raw.pfLedgerState) : undefined,
      pfPendingCreditUsdt: (() => {
        const n = Number(raw.pfPendingCreditUsdt);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      })(),
    };
  });
}

/** @deprecated 用户路径勿用绝对值 SET；仅遗留兼容 */
export async function publishPfBalance(playerId, userId, balance) {
  const bal = roundUsdt(balance);
  await accountStore.updatePlayerBalance(playerId, bal, userId);
  return publishPfBalanceKnown(playerId, userId, bal);
}

/** DB 余额已由 debit/credit 更新时，只同步 ACCOUNT 缓存与统计 */
export async function publishPfBalanceKnown(playerId, userId, balance) {
  const orders = await loadPfOrders(playerId, userId);
  const stats = summarizePfOrders(orders);
  const bal = roundUsdt(balance);
  // KV 仍更新侧栏需要的统计；HTTP 回包不整行 ACCOUNT（中转只回账本字段）
  await syncAccountRowInKv(playerId, {
    balance: bal,
    credit: 0,
    currency: "USDT",
    totalProfit: stats.settledPnl,
    unsettle: stats.unsettle,
    orderCount: stats.orderCount,
  }, userId);

  return {
    ok: true,
    info: toUserPfBalanceInfo({
      accountId: Number(playerId),
      balance: bal,
      credit: 0,
      currency: "USDT",
      totalProfit: stats.settledPnl,
      unsettle: stats.unsettle,
      orderCount: stats.orderCount,
      settledPnl: stats.settledPnl,
      openStake: stats.openStake,
    }),
  };
}

/** 终态已写但入账失败：RDS 同事务 credit + 标 credited */
export async function applyPendingPfLedgerCredit(playerId, userId, row) {
  if (readPfLedgerState(row) !== "pending_credit")
    return { ok: false, skipped: true };
  const key = rdsOrderKey(row);
  if (!key)
    return { ok: false, amount: 0 };
  const claimed = await accountStore.claimCreditPfPendingOrder(playerId, key, userId);
  if (!claimed?.ok)
    return { ok: false, amount: readPfPendingCreditUsdt(row) };
  if (claimed.skipped)
    return { ok: true, skipped: true, amount: 0 };
  if (claimed.total != null)
    await publishPfBalanceKnown(playerId, userId, claimed.total);
  return { ok: true, amount: Number(claimed.amount) || 0, balance: claimed.total };
}

export async function retryPendingPfLedgerCredits(playerId, userId) {
  const list = await loadPfOrders(playerId, userId);
  let creditedCount = 0;
  let creditedUsdt = 0;
  for (const row of list) {
    if (readPfLedgerState(row) !== "pending_credit")
      continue;
    let result = { ok: false };
    await withHouseOrderLock(async () => {
      const freshList = await loadPfOrders(playerId, userId);
      const fresh = freshList.find(r => rdsOrderKey(r) === rdsOrderKey(row));
      if (!fresh || readPfLedgerState(fresh) !== "pending_credit")
        return;
      result = await applyPendingPfLedgerCredit(playerId, userId, fresh);
    });
    if (result.ok && result.amount > 0) {
      creditedCount += 1;
      creditedUsdt = roundUsdt(creditedUsdt + result.amount);
    }
  }
  return { creditedCount, creditedUsdt };
}
