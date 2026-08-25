/**
 * Official PF order status -> RDS (reject refund / fill / late fee).
 * Persist via upsertPfServerOrder (server-only; not Client_SaveOrder).
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
import { readPfLedgerState, isPfUserSignedOrder, readInternalPfSellState, pfUserSignedSavePatch } from "./pf_lifecycle.js";
import {
  applyPendingPfLedgerCredit,
  loadPfOrdersStrict,
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
  fetchPredictOrderByHash,
  hasWalletFeeSignal,
  isOpenChangmenOrderStatus,
  mapPredictOrderToVenueOrder,
  settlementFromPredictOfficialStatus,
} from "./pf_orders.js";
import { withHouseOrderLock } from "./pf_order_service.js";
import { upsertPfServerOrder } from "./pf_server_order.js";

/**
 * Sync official status into RDS; refund stake when rejected while open.
 * @returns {{ venueOrder: object, refunded: boolean, settlement: string }}
 */
export async function syncOfficialOrderToRds(playerId, userId, rdsRow, official) {
  let settlement = settlementFromPredictOfficialStatus(official?.status);
  let venueOrder = mapPredictOrderToVenueOrder(official, rdsToMapInput(rdsRow));

  // closing 买单若带着卖单官方态进来：勿当买单 fill 改写；由 SubmitSell / GetOrder resume 关单
  if (readInternalPfSellState(rdsRow) === "closing") {
    return {
      venueOrder: mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow)),
      refunded: false,
      settlement: settlement === "filled" ? "timeout" : settlement,
    };
  }

  // 已是 Reject：清掉残留意向份额；pending_credit 继续补退款
  if (String(rdsOrderStatus(rdsRow)).toLowerCase() === "reject") {
    const dirtyShares = Number(rdsRow?.pfShares) > 0
      || Number(rdsRow?.pfHoldShares) > 0
      || Boolean(String(rdsRow?.pfSharesWei ?? "").trim());
    if (dirtyShares) {
      const clearRow = {
        ...mapPredictOrderToVenueOrder(official, rdsToMapInput(rdsRow)),
        status: "reject",
        pfOfficialStatus: official?.status ?? rdsRow?.pfOfficialStatus,
        pfOrderHash: rdsPfHash(rdsRow),
        pfApiOrderId: rdsPfApiOrderId(rdsRow),
        ...pfUserSignedSavePatch(rdsRow),
      };
      delete clearRow.pfShares;
      delete clearRow.pfSharesWei;
      delete clearRow.pfHoldShares;
      delete clearRow.pfHoldSharesWei;
      await upsertPfServerOrder(playerId, [clearRow], userId);
    }
    if (readPfLedgerState(rdsRow) === "pending_credit") {
      return withHouseOrderLock(async () => {
        const freshList = await loadPfOrdersStrict(playerId, userId);
        const key = rdsOrderKey(rdsRow);
        const fresh = freshList.find(row => rdsOrderKey(row) === key) ?? rdsRow;
        if (rdsAlreadyRefunded(fresh)) {
          return {
            venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh)),
            refunded: false,
            settlement: "unfilled",
          };
        }
        // 用户自签：从未扣 total_balance，禁止「退款」入账
        if (isPfUserSignedOrder(fresh)) {
          await upsertPfServerOrder(playerId, [{
            ...mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh)),
            status: "reject",
            pfLedgerState: "credited",
            pfPendingCreditUsdt: 0,
            pfRefundedAt: Date.now(),
            ...pfUserSignedSavePatch(fresh),
          }], userId);
          return {
            venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput({
              ...fresh,
              status: "reject",
            })),
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
    return {
      venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput(rdsRow)),
      refunded: false,
      settlement: "unfilled",
    };
  }

  if (venueOrder.status === "reject" && isOpenChangmenOrderStatus(rdsOrderStatus(rdsRow))) {
    return withHouseOrderLock(async () => {
      const freshList = await loadPfOrdersStrict(playerId, userId);
      const key = rdsOrderKey(rdsRow);
      const fresh = freshList.find(row => rdsOrderKey(row) === key) ?? rdsRow;
      if (rdsAlreadyRefunded(fresh) || !isOpenChangmenOrderStatus(rdsOrderStatus(fresh))) {
        return {
          venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh)),
          refunded: false,
          settlement: "unfilled",
        };
      }

      console.info("[Pf_RejectBucket] accepted_then_cancelled", {
        playerId,
        orderKey: key,
        officialStatus: String(official?.status ?? ""),
      });

      const stake = rdsBetMoney(fresh);
      const userSigned = isPfUserSignedOrder(fresh);
      const nextVenue = mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh));
      const rejectRow = {
        ...nextVenue,
        status: "reject",
        pfOfficialStatus: official?.status,
        pfOrderHash: rdsPfHash(fresh),
        pfApiOrderId: rdsPfApiOrderId(fresh),
        // 自签：无中转扣款，直接 credited；house：pending_credit 后退款
        pfLedgerState: userSigned || !(stake > 0) ? "credited" : "pending_credit",
        pfPendingCreditUsdt: userSigned || !(stake > 0) ? 0 : stake,
        ...((userSigned || !(stake > 0)) ? { pfRefundedAt: Date.now() } : {}),
        ...pfUserSignedSavePatch(fresh),
      };
      // 未成交：清空意向/残留成交份额（merge 对 reject 亦不再回填）
      delete rejectRow.pfShares;
      delete rejectRow.pfSharesWei;
      delete rejectRow.pfHoldShares;
      delete rejectRow.pfHoldSharesWei;
      const saved = await upsertPfServerOrder(playerId, [rejectRow], userId);
      if (!saved)
        throw new Error("拒单落库失败");

      let refunded = false;
      if (userSigned) {
        refunded = false;
      }
      else if (stake > 0) {
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
    const isSellRow = String(rdsRow?.pfSide ?? rdsRow?.PfSide ?? "").toLowerCase() === "sell";
    const fill = isSellRow
      ? extractSellFill(official, {
          fallbackSharesWei: rdsRow?.pfSharesWei ?? rdsRow?.PfSharesWei,
        })
      : extractBuyFillShares(official, rdsRow?.pfSharesWei);
    // 成交份额只认官网；fill=0 时勿把 RDS 意向 size 喂给 fee/hold
    const feePatch = resolvePfFeeSavePatch(official, rdsRow, {
      ...(fill.shares > 0
        ? {
            pfShares: fill.shares,
            pfSharesWei: fill.sharesWei > 0n ? String(fill.sharesWei) : undefined,
          }
        : {}),
    });
    const feeRateBps = Number(
      rdsRow?.pfFeeRateBps ?? rdsRow?.PfFeeRateBps ?? feePatch.pfFeeRateBps ?? 0,
    ) || 0;
    // feeRateBps>0 且尚无 wallet fee：hold 未齐；RDS 保持 pending，编排须继续等（勿提前 filled）
    const feeWeiReady = (() => {
      const wei = String(feePatch.pfFeeAmountWei ?? "").trim();
      return /^\d+$/.test(wei) && BigInt(wei) > 0n;
    })();
    const buyFeeReady = isSellRow || feeRateBps <= 0 || hasWalletFeeSignal(official)
      || feeWeiReady
      // 自签：官网 OrderData 无 fee 字段；FILLED+amountFilled 即可写 hold（fee 在 wallet events）
      || isPfUserSignedOrder(rdsRow);
    // fee 齐后再扣 Changmencodefee，并写入 hold
    if (!isSellRow && buyFeeReady) {
      const storedBuyBps = readChangmenCodeFeeRateBps(rdsRow);
      const buyBps = storedBuyBps != null ? storedBuyBps : resolvePfChangmenBuyFeeRateBps();
      const officialHold = Number(feePatch.pfHoldShares) > 0
        ? Number(feePatch.pfHoldShares)
        : (fill.shares > 0 ? fill.shares : 0);
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
                shares: fill.shares > 0 ? fill.shares : undefined,
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
      ...pfUserSignedSavePatch(rdsRow),
    }], userId);
      if (!isSellRow && !buyFeeReady) {
        // 官方已 FILLED，但手续费未齐：对编排仍为 timeout，继续 GetOrder 轮询
        settlement = "timeout";
        venueOrder = { ...venueOrder, status: "pending" };
      }
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
      const list = await loadPfOrdersStrict(playerId, userId);
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
        ...pfUserSignedSavePatch(rdsRow),
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
      ...pfUserSignedSavePatch(rdsRow),
    }], userId);
  }

  return { venueOrder, refunded: false, settlement };
}

export async function lookupOfficialOrder(rdsRow, orderId, opts = {}) {
  const jwt = String(opts?.jwt ?? "").trim();
  const sellState = String(rdsRow?.pfSellState ?? rdsRow?.PfSellState ?? "").trim().toLowerCase();
  const sellHash = String(rdsRow?.pfSellOrderId ?? rdsRow?.PfSellOrderId ?? "").trim();
  // closing 查卖单；否则查买单（与旧 house 一致）
  const hash = (sellState === "closing" && sellHash)
    ? sellHash
    : (rdsRow ? (rdsPfHash(rdsRow) || orderId) : orderId);

  // 有用户 jwt：只走 REST（等同旧 house 的 Get-by-hash，换钥匙）
  if (jwt) {
    let official = await fetchPredictOrderByHash(hash, jwt);
    if (official)
      return official;
    const apiId = rdsRow ? rdsPfApiOrderId(rdsRow) : "";
    if (apiId && apiId !== hash)
      official = await fetchPredictOrderByHash(apiId, jwt);
    return official;
  }

  // 自签单必须带 jwt；无 jwt 时不要用 house 钥匙去查
  if (isPfUserSignedOrder(rdsRow))
    return null;

  // 仅历史 house 中转单：仍可用 house JWT + wallet hint
  let official = await fetchHousePredictOrderResolved(hash);
  if (official)
    return official;
  const apiId = rdsRow ? rdsPfApiOrderId(rdsRow) : "";
  if (apiId && apiId !== hash)
    official = await fetchHousePredictOrderResolved(apiId);
  return official;
}
