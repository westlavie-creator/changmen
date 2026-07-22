/**
 * ???? ? RDS ??????? / ???? / ?? fee?
 * ????pf_client_handlers????pf_player_account?????pf_order_row
 * ??? upsertPfServerOrder???????? Client_SaveOrder?
 */

import * as accountStore from "../../account/account_store.js";
import {
  changmenCodeFeeSavePatch,
  readChangmenCodeFeeRateBps,
  readChangmenCodeFeeShares,
  readChangmenCodeFeeUsdt,
} from "./pf_changmen_code_fee.js";
import { resolvePfChangmenBuyFeeRateBps, resolvePfChangmenSellFeeRateBps } from "./house_credentials.js";
import { roundUsdt } from "./pf_ledger.js";
import { readPfLedgerState } from "./pf_lifecycle.js";
import {
  applyPendingPfLedgerCredit,
  loadPfOrders,
  publishPfBalanceKnown,
} from "./pf_player_account.js";
import {
  rdsAlreadyRefunded,
  rdsBetMoney,
  rdsOrderKey,
  rdsOrderStatus,
  rdsPfApiOrderId,
  rdsPfHash,
  rdsToMapInput,
} from "./pf_order_row.js";
import { extractBuyFillCostUsdt, extractBuyFillShares, extractBuyNotionalUsdt, extractSellFill } from "./pf_fill.js";
import {
  applyChangmenBuyFeeToHoldShares,
  netSellProceedsAfterChangmenFee,
  netSellProceedsAfterCollateralFee,
  resolvePfFeeSavePatch,
} from "./pf_fee.js";
import {
  fetchHousePredictOrderResolved,
  hasWalletFeeSignal,
  isOpenChangmenOrderStatus,
  mapPredictOrderToVenueOrder,
  settlementFromPredictOfficialStatus,
} from "./pf_orders.js";
import { withHouseOrderLock } from "./pf_order_service.js";
import { upsertPfServerOrder } from "./pf_server_order.js";

/**
 * ??????? RDS???????? ? ?? stake???? + ???
 * @returns {{ venueOrder: object, refunded: boolean, settlement: string }}
 */
export async function syncOfficialOrderToRds(playerId, userId, rdsRow, official) {
  const settlement = settlementFromPredictOfficialStatus(official?.status);
  const venueOrder = mapPredictOrderToVenueOrder(official, rdsToMapInput(rdsRow));

  // ? reject ????????? pending_credit???????????
  if (
    String(rdsOrderStatus(rdsRow)).toLowerCase() === "reject"
    && readPfLedgerState(rdsRow) === "pending_credit"
  ) {
    return withHouseOrderLock(async () => {
      const freshList = await loadPfOrders(playerId, userId);
      const key = rdsOrderKey(rdsRow);
      const fresh = freshList.find(row => rdsOrderKey(row) === key) ?? rdsRow;
      if (rdsAlreadyRefunded(fresh)) {
        return {
          venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh)),
          refunded: false,
          settlement: "unfilled",
        };
      }
      const creditResult = await applyPendingPfLedgerCredit(playerId, userId, fresh);
      return {
        venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput({
          ...fresh,
          status: "reject",
        })),
        refunded: Boolean(creditResult.ok && creditResult.amount > 0),
        settlement: "unfilled",
      };
    });
  }

  if (venueOrder.status === "reject" && isOpenChangmenOrderStatus(rdsOrderStatus(rdsRow))) {
    return withHouseOrderLock(async () => {
      const freshList = await loadPfOrders(playerId, userId);
      const key = rdsOrderKey(rdsRow);
      const fresh = freshList.find(row => rdsOrderKey(row) === key) ?? rdsRow;
      if (rdsAlreadyRefunded(fresh) || !isOpenChangmenOrderStatus(rdsOrderStatus(fresh))) {
        return {
          venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh)),
          refunded: false,
          settlement: "unfilled",
        };
      }

      const stake = rdsBetMoney(fresh);
      const nextVenue = mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh));
      // ?? reject + pending_credit??? pfRefundedAt????????? credited/RefundedAt
      const saved = await upsertPfServerOrder(playerId, [{
        ...nextVenue,
        status: "reject",
        pfOfficialStatus: official?.status,
        pfOrderHash: rdsPfHash(fresh),
        pfApiOrderId: rdsPfApiOrderId(fresh),
        pfLedgerState: stake > 0 ? "pending_credit" : "credited",
        pfPendingCreditUsdt: stake > 0 ? stake : 0,
        ...(stake > 0 ? {} : { pfRefundedAt: Date.now() }),
      }], userId);
      if (!saved)
        throw new Error("??????");

      let refunded = false;
      if (stake > 0) {
        const creditResult = await applyPendingPfLedgerCredit(playerId, userId, {
          ...fresh,
          ...nextVenue,
          status: "reject",
          orderId: key,
          pfLedgerState: "pending_credit",
          pfPendingCreditUsdt: stake,
        });
        refunded = Boolean(creditResult.ok && !creditResult.skipped && creditResult.amount > 0);
        if (!creditResult.ok)
          console.warn("[Pf_Sync] reject credit pending", key);
      }
      else {
        refunded = true;
      }
      return { venueOrder: { ...nextVenue, status: "reject" }, refunded, settlement: "unfilled" };
    });
  }

  if (venueOrder.status === "none" && isOpenChangmenOrderStatus(rdsOrderStatus(rdsRow))) {
    const fill = extractBuyFillShares(official, rdsRow?.pfSharesWei);
    const isSellRow = String(rdsRow?.pfSide ?? rdsRow?.PfSide ?? "").toLowerCase() === "sell";
    const feePatch = resolvePfFeeSavePatch(official, rdsRow, {
      pfShares: fill.shares > 0 ? fill.shares : (rdsRow?.pfShares ?? rdsRow?.PfShares),
      pfSharesWei: fill.sharesWei > 0n
        ? String(fill.sharesWei)
        : (rdsRow?.pfSharesWei ?? rdsRow?.PfSharesWei),
    });
    const feeRateBps = Number(
      rdsRow?.pfFeeRateBps ?? rdsRow?.PfFeeRateBps ?? feePatch.pfFeeRateBps ?? 0,
    ) || 0;
    // ???????>0 ????? wallet fee????? hold ?? None
    const buyFeeReady = isSellRow || feeRateBps <= 0 || hasWalletFeeSignal(official)
      || Boolean(String(feePatch.pfFeeAmountWei ?? "").trim());
    // ??????????? Changmencodefee????????? RDS ??
    if (!isSellRow && buyFeeReady) {
      const storedBuyBps = readChangmenCodeFeeRateBps(rdsRow);
      const buyBps = storedBuyBps != null ? storedBuyBps : resolvePfChangmenBuyFeeRateBps();
      const officialHold = Number(feePatch.pfHoldShares) > 0
        ? Number(feePatch.pfHoldShares)
        : (fill.shares > 0 ? fill.shares : Number(rdsRow?.pfShares));
      if (officialHold > 0 && buyBps > 0) {
        const applied = applyChangmenBuyFeeToHoldShares(officialHold, buyBps);
        feePatch.pfHoldShares = applied.holdShares;
        Object.assign(feePatch, changmenCodeFeeSavePatch({
          rateBps: applied.changmenCodeFeeRateBps,
          shares: applied.changmenCodeFeeShares,
        }));
      }
    }
    else if (!isSellRow && !buyFeeReady) {
      // ????????????????? hold????? Pending
      delete feePatch.pfHoldShares;
      delete feePatch.pfHoldSharesWei;
    }
    const planned = rdsBetMoney(rdsRow);
    const bookPrice = Number(rdsRow?.pfBookPrice ?? rdsRow?.PfBookPrice) || 0;
    // ???????? pfFillCostUsdt?bet_money ??????????????? house?
    const fillCost = !isSellRow
      ? (extractBuyFillCostUsdt(official, 0, { excludeMakerAmount: true }) || undefined)
      : undefined;
    const notional = !isSellRow
      ? (
          Number(rdsRow?.pfNotionalUsdt ?? rdsRow?.PfNotionalUsdt) > 0
            ? roundUsdt(Number(rdsRow?.pfNotionalUsdt ?? rdsRow?.PfNotionalUsdt))
            : extractBuyNotionalUsdt(official, {
                shares: fill.shares > 0 ? fill.shares : Number(rdsRow?.pfShares),
                bookPrice: bookPrice > 0 ? bookPrice : undefined,
                fallbackUsdt: planned,
              })
        )
      : undefined;
    await upsertPfServerOrder(playerId, [{
      ...venueOrder,
      status: (!isSellRow && !buyFeeReady) ? "pending" : "none",
      // ?????????????
      betMoney: planned,
      pfOfficialStatus: official?.status,
      pfOrderHash: rdsPfHash(rdsRow),
      pfApiOrderId: rdsPfApiOrderId(rdsRow),
      pfAmountFilled: fill.amountFilledRaw,
      ...(fill.sharesWei > 0n
        ? {
            pfSharesWei: String(fill.sharesWei),
            pfShares: fill.shares,
          }
        : {}),
      ...(fillCost != null && fillCost > 0 ? { pfFillCostUsdt: fillCost } : {}),
      ...(notional != null ? { pfNotionalUsdt: notional } : {}),
      ...feePatch,
      ...(feeRateBps >= 0 ? { pfFeeRateBps: feeRateBps } : {}),
    }], userId);
  }
  else if (
    venueOrder.status === "none"
    && String(rdsOrderStatus(rdsRow)).toLowerCase() === "none"
    && (
      !String(rdsRow?.pfFeeAmountWei ?? "").trim()
      || !(Number(rdsRow?.pfHoldShares) > 0)
      || !(Number(rdsRow?.pfFillCostUsdt) > 0)
    )
  ) {
    // ????????? wallet fee / ???? / ???????????? bet_money?
    const isSellLate = String(rdsRow?.pfSide ?? "").toLowerCase() === "sell";
    const hadFeeBefore = Boolean(String(rdsRow?.pfFeeAmountWei ?? "").trim());
    const feePatch = resolvePfFeeSavePatch(official, rdsRow, {
      pfShares: rdsRow?.pfShares ?? rdsRow?.PfShares,
      pfSharesWei: rdsRow?.pfSharesWei ?? rdsRow?.PfSharesWei,
    });
    if (!isSellLate && feePatch.pfHoldShares != null) {
      const storedBuyBps = readChangmenCodeFeeRateBps(rdsRow);
      const buyBps = storedBuyBps != null ? storedBuyBps : resolvePfChangmenBuyFeeRateBps();
      if (buyBps > 0) {
        const applied = applyChangmenBuyFeeToHoldShares(Number(feePatch.pfHoldShares), buyBps);
        feePatch.pfHoldShares = applied.holdShares;
        Object.assign(feePatch, changmenCodeFeeSavePatch({
          rateBps: applied.changmenCodeFeeRateBps,
          shares: applied.changmenCodeFeeShares,
        }));
      }
    }

    // ????????? fee ??????????????????????
    /** @type {{ buyOrderId: string, proceeds: number, profit: number, delta: number, changmenPatch: Record<string, number> } | null} */
    let sellProceedsFix = null;
    if (
      isSellLate
      && !hadFeeBefore
      && String(feePatch.pfFeeAmountWei ?? "").trim()
    ) {
      const fill = extractSellFill(official, {
        fallbackProceedsUsdt: rdsBetMoney(rdsRow),
        fallbackSharesWei: rdsRow?.pfSharesWei ?? rdsRow?.PfSharesWei,
      });
      const afterOfficial = netSellProceedsAfterCollateralFee(fill.proceedsUsdt, feePatch);
      const storedSellBps = readChangmenCodeFeeRateBps(rdsRow);
      const sellBps = storedSellBps != null ? storedSellBps : resolvePfChangmenSellFeeRateBps();
      const {
        proceedsUsdt: proceedsRaw,
        changmenCodeFeeUsdt,
        changmenCodeFeeRateBps,
      } = netSellProceedsAfterChangmenFee(afterOfficial, sellBps);
      const proceeds = roundUsdt(proceedsRaw);
      const oldProceeds = roundUsdt(rdsBetMoney(rdsRow));
      const delta = roundUsdt(proceeds - oldProceeds);
      const buyOrderId = String(rdsRow?.pfBuyOrderId ?? "").trim();
      if (buyOrderId && delta !== 0) {
        sellProceedsFix = {
          buyOrderId,
          proceeds,
          profit: 0,
          delta,
          changmenPatch: changmenCodeFeeSavePatch({
            rateBps: changmenCodeFeeRateBps > 0 ? changmenCodeFeeRateBps : undefined,
            usdt: changmenCodeFeeUsdt,
          }),
        };
      }
    }

    const fillCost = isSellLate
      ? 0
      : extractBuyFillCostUsdt(official, 0, { excludeMakerAmount: true });
    const needFillCost = !isSellLate && !(Number(rdsRow?.pfFillCostUsdt) > 0) && fillCost > 0;

    if (sellProceedsFix) {
      // ???? fee??? fee + ?? proceeds + ??????????????????
      const list = await loadPfOrders(playerId, userId);
      const buy = list.find((row) => {
        const id = rdsOrderKey(row);
        const hash = rdsPfHash(row);
        return id === sellProceedsFix.buyOrderId || hash === sellProceedsFix.buyOrderId;
      });
      if (!buy) {
        console.warn("[Pf_Sync] late sell fee: buy missing", sellProceedsFix.buyOrderId);
      }
      else {
        const stake = rdsBetMoney(buy);
        const profit = roundUsdt(sellProceedsFix.proceeds - stake);
        const sellOid = rdsOrderKey(rdsRow);
        const adjusted = await accountStore.adjustPfSellProceedsAfterFee(playerId, userId, {
          buyOrderId: rdsOrderKey(buy),
          sellOrderId: sellOid,
          targetProceeds: sellProceedsFix.proceeds,
          targetProfit: profit,
          buyRawExtra: {
            pfSellState: buy.pfSellState || "closed",
            pfSellOrderId: buy.pfSellOrderId || sellOid,
            pfFeeRateBps: buy.pfFeeRateBps,
            ...changmenCodeFeeSavePatch({
              rateBps: buy.pfChangmenCodeFeeRateBps,
              shares: buy.pfChangmenCodeFeeShares,
            }),
          },
          sellRawExtra: {
            pfOfficialStatus: official?.status,
            pfOrderHash: rdsPfHash(rdsRow),
            pfApiOrderId: rdsPfApiOrderId(rdsRow),
            pfSharesWei: rdsRow?.pfSharesWei,
            pfShares: rdsRow?.pfShares,
            pfSide: rdsRow?.pfSide,
            pfSellState: rdsRow?.pfSellState,
            pfBuyOrderId: rdsRow?.pfBuyOrderId,
            pfBookPrice: rdsRow?.pfBookPrice,
            pfNotionalUsdt: rdsRow?.pfNotionalUsdt,
            ...changmenCodeFeeSavePatch({
              rateBps: readChangmenCodeFeeRateBps(rdsRow),
              shares: readChangmenCodeFeeShares(rdsRow),
              usdt: readChangmenCodeFeeUsdt(rdsRow),
            }),
            ...sellProceedsFix.changmenPatch,
            ...feePatch,
          },
        });
        if (!adjusted?.ok)
          console.warn("[Pf_Sync] late sell fee adjust failed", sellProceedsFix.buyOrderId);
        else if (!adjusted.skipped && adjusted.total != null)
          await publishPfBalanceKnown(playerId, userId, adjusted.total);
      }
    }
    else if (feePatch.pfFeeAmountWei || feePatch.pfHoldShares != null || needFillCost) {
      await upsertPfServerOrder(playerId, [{
        ...venueOrder,
        status: "none",
        betMoney: rdsBetMoney(rdsRow),
        money: isSellLate ? 0 : (venueOrder.money ?? 0),
        pfOfficialStatus: official?.status,
        pfOrderHash: rdsPfHash(rdsRow),
        pfApiOrderId: rdsPfApiOrderId(rdsRow),
        pfSharesWei: rdsRow?.pfSharesWei,
        pfShares: rdsRow?.pfShares,
        pfSide: rdsRow?.pfSide,
        pfSellState: rdsRow?.pfSellState,
        pfBuyOrderId: rdsRow?.pfBuyOrderId,
        pfBookPrice: rdsRow?.pfBookPrice,
        pfNotionalUsdt: rdsRow?.pfNotionalUsdt,
        ...changmenCodeFeeSavePatch({
          rateBps: readChangmenCodeFeeRateBps(rdsRow),
          shares: readChangmenCodeFeeShares(rdsRow),
          usdt: readChangmenCodeFeeUsdt(rdsRow),
        }),
        ...(needFillCost ? { pfFillCostUsdt: fillCost } : {}),
        ...feePatch,
      }], userId);
    }
  }
  else if (venueOrder.status === "pending" && String(rdsOrderStatus(rdsRow)).toLowerCase() !== "pending") {
    await upsertPfServerOrder(playerId, [{
      ...venueOrder,
      status: "pending",
      pfOfficialStatus: official?.status,
      pfOrderHash: rdsPfHash(rdsRow),
      pfApiOrderId: rdsPfApiOrderId(rdsRow),
    }], userId);
  }

  return { venueOrder, refunded: false, settlement };
}

export async function lookupOfficialOrder(rdsRow, orderId) {
  const hash = rdsRow ? (rdsPfHash(rdsRow) || orderId) : orderId;
  // ????/?????REST + wallet hint???? waitForHouseOrderTerminal ???
  let official = await fetchHousePredictOrderResolved(hash);
  if (official)
    return official;
  const apiId = rdsRow ? rdsPfApiOrderId(rdsRow) : "";
  if (apiId && apiId !== hash)
    official = await fetchHousePredictOrderResolved(apiId);
  return official;
}
