/**
 * PredictFun 市场结算：RESOLVED → win/lose + pending_credit 入账
 */

import { assertPlayerOwnedByUser } from "../../account/player_ownership.js";
import { roundUsdt } from "./pf_ledger.js";
import { isPfSellBlockedForSettle } from "./pf_lifecycle.js";
import {
  applyPendingPfLedgerCredit,
  loadPfOrders,
  publishPfBalanceKnown,
  resolvePfBalance,
  retryPendingPfLedgerCredits,
} from "./pf_player_account.js";
import {
  rdsBetMoney,
  rdsOrderKey,
  rdsOrderStatus,
  rdsToMapInput,
} from "./pf_order_row.js";
import { withHouseOrderLock } from "./pf_order_service.js";
import { fetchPredictMarket } from "./pf_api.js";
import { computePfSettlement, resolvePfMarketOutcome } from "./pf_settle.js";
import { tryRedeemHouseMarketAfterSettle } from "./pf_house_redeem.js";
import { mapPredictOrderToVenueOrder } from "./pf_orders.js";
import { upsertPfServerOrder } from "./pf_server_order.js";

/**
 * @returns {Promise<{ settled: number, wins: number, losses: number, balanceDelta: number }>}
 */
export async function settleResolvedPfOrdersForPlayer(playerId, userId) {
  await retryPendingPfLedgerCredits(playerId, userId);

  const list = await loadPfOrders(playerId, userId);
  const marketCache = new Map();
  let settled = 0;
  let wins = 0;
  let losses = 0;
  let balanceDeltaTotal = 0;

  for (const rdsRow of list) {
    const st = String(rdsOrderStatus(rdsRow)).toLowerCase();
    if (st !== "none")
      continue;
    if (String(rdsRow?.pfSide ?? "").toLowerCase() === "sell")
      continue;
    if (isPfSellBlockedForSettle(rdsRow))
      continue;

    const marketId = String(
      rdsRow?.pfMarketId
        ?? rdsRow?.match
        ?? rdsRow?.Match
        ?? "",
    ).trim();
    const tokenId = String(
      rdsRow?.pfTokenId
        ?? rdsRow?.item
        ?? rdsRow?.Item
        ?? "",
    ).trim();
    if (!marketId || !tokenId)
      continue;

    let market = marketCache.get(marketId);
    if (market === undefined) {
      try {
        market = await fetchPredictMarket(marketId);
      }
      catch (err) {
        console.warn("[Pf_Settle] market fetch failed", marketId, err);
        market = null;
      }
      marketCache.set(marketId, market);
    }
    if (!market)
      continue;

    const outcome = resolvePfMarketOutcome(market, tokenId);
    if (!outcome)
      continue;

    const betMoney = rdsBetMoney(rdsRow);
    const holdStored = Number(rdsRow?.pfHoldShares ?? rdsRow?.PfHoldShares);
    if (!(Number.isFinite(holdStored) && holdStored > 0)) {
      console.warn(
        "[Pf_Settle] skip: missing pfHoldShares",
        rdsOrderKey(rdsRow),
        marketId,
      );
      continue;
    }
    const shares = holdStored;
    const bookPrice = Number(rdsRow?.pfBookPrice ?? rdsRow?.PfBookPrice) || 0;
    const computed = computePfSettlement(betMoney, { shares, bookPrice }, outcome);

    let applied = null;
    await withHouseOrderLock(async () => {
      const freshList = await loadPfOrders(playerId, userId);
      const key = rdsOrderKey(rdsRow);
      const fresh = freshList.find(row => rdsOrderKey(row) === key);
      if (!fresh || String(rdsOrderStatus(fresh)).toLowerCase() !== "none")
        return;
      if (isPfSellBlockedForSettle(fresh))
        return;

      const creditUsdt = computed.balanceDelta > 0 ? roundUsdt(computed.balanceDelta) : 0;
      const venue = mapPredictOrderToVenueOrder(null, rdsToMapInput(fresh));
      const saved = await upsertPfServerOrder(playerId, [{
        ...venue,
        status: computed.status,
        money: computed.money,
        pfSellState: "settled",
        pfSettledAt: Date.now(),
        pfMarketStatus: market.status,
        pfOutcomeStatus: outcome,
        pfLedgerState: creditUsdt > 0 ? "pending_credit" : "credited",
        pfPendingCreditUsdt: creditUsdt,
      }], userId);
      if (!saved)
        return;

      if (creditUsdt > 0) {
        const creditResult = await applyPendingPfLedgerCredit(playerId, userId, {
          ...fresh,
          ...venue,
          status: computed.status,
          money: computed.money,
          pfSellState: "settled",
          pfLedgerState: "pending_credit",
          pfPendingCreditUsdt: creditUsdt,
        });
        if (!creditResult.ok)
          console.warn("[Pf_Settle] credit pending after settle", key);
      }
      else {
        const owned = await assertPlayerOwnedByUser(playerId, userId);
        if (owned.ok) {
          const bal = await resolvePfBalance(owned.player, userId, playerId);
          await publishPfBalanceKnown(playerId, userId, bal);
        }
      }
      applied = computed;
    });

    if (!applied)
      continue;

    balanceDeltaTotal = roundUsdt(balanceDeltaTotal + applied.balanceDelta);
    settled += 1;
    if (outcome === "win")
      wins += 1;
    else
      losses += 1;

    if (outcome === "win")
      await tryRedeemHouseMarketAfterSettle(marketId);
  }

  return { settled, wins, losses, balanceDelta: balanceDeltaTotal };
}
