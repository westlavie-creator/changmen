import { opponentSide } from "@/models/betOption";
import { saveOrderBind } from "@/api/esport";
import type { PlatformAccount } from "@/models/platformAccount";
import type { OrderBindRow } from "@/models/betResult";
import type { VenueOrder } from "@platform/contract";
import { useAccountStore } from "@/stores/accountStore";
import {
  useMessageStore,
  type BettingMessageLeg,
  type BettingMessageSingleLegRatePeer,
} from "@/stores/messageStore";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
import { scheduleDeferredArbRejectMakeUp } from "@/stores/betting/autoBet/deferArbRejectMakeUp";
import { rejectWaitSeconds } from "@/stores/betting/autoBet/rejectWait";
import { pollVenueRejectFlags } from "@/stores/betting/autoBet/venueRejectSync";
import { findSingleLegRateAccount } from "@/extensions/arbBet/rate9999";
import { readUsedAccounts } from "@/stores/betting/successMarkers";
import { useMatchStore } from "@/stores/matchStore";
import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";

function singleLegRatePeer(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): BettingMessageSingleLegRatePeer | null {
  const { match, bet, config } = params;
  const { legA, legB, accountA, accountB } = placed;
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();

  if (accountA && accountB) return null;

  const skippedLeg = accountA ? legB : legA;
  const exclude = config.noSameBet
    ? readUsedAccounts(bet.id, opponentSide(skippedLeg.target))
    : [];
  const rateAccount = findSingleLegRateAccount(
    skippedLeg,
    bet,
    match,
    accountStore.accounts,
    exclude,
    matchStore,
    placed.implied,
  );
  const platformLabel =
    rateAccount?.platformName ||
    rateAccount?.provider ||
    skippedLeg.type;
  return {
    kind: "singleLegRate",
    options: skippedLeg,
    platformLabel,
  };
}

function buildBettingMessagePeers(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
  rejectA: boolean,
  rejectB: boolean,
): [BettingMessageLeg | BettingMessageSingleLegRatePeer, BettingMessageLeg | BettingMessageSingleLegRatePeer] | null {
  const { legA, legB, accountA, accountB, resultA, resultB, betBothLegs } = placed;
  if (!resultA && !resultB) return null;
  if (!(resultA?.success || resultB?.success)) return null;

  if (betBothLegs && accountA && accountB && resultA && resultB) {
    return [
      { account: accountA, result: resultA, options: legA, reject: rejectA },
      { account: accountB, result: resultB, options: legB, reject: rejectB },
    ];
  }

  const skipped = singleLegRatePeer(params, placed);
  if (!skipped) return null;

  if (accountA && resultA?.success) {
    return [
      { account: accountA, result: resultA, options: legA, reject: rejectA },
      skipped,
    ];
  }
  if (accountB && resultB?.success) {
    return [
      skipped,
      { account: accountB, result: resultB, options: legB, reject: rejectB },
    ];
  }
  return null;
}

/** 拒单等待、补单入队、成功标记、绑单、消息（顺序对齐 A8 bundle） */
export async function finalizeArbBet(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): Promise<void> {
  const { bet, config } = params;
  const accountStore = useAccountStore();
  const {
    legA,
    legB,
    accountA,
    accountB,
    betBothLegs,
    linkId,
    waitSec,
    resultA,
    resultB,
  } = placed;

  const successAccounts: PlatformAccount[] = [];
  if (resultA?.success && accountA) {
    successAccounts.push(accountA);
    void accountStore.refreshBalance(accountA);
  }
  if (resultB?.success && accountB) {
    successAccounts.push(accountB);
    void accountStore.refreshBalance(accountB);
  }

  let ordersA: VenueOrder[] = [];
  let ordersB: VenueOrder[] = [];
  let rejectA = false;
  let rejectB = false;

  if (successAccounts.length) {
    const rejectWait = rejectWaitSeconds(config, successAccounts);
    const polled = await pollVenueRejectFlags(
      resultA,
      accountA,
      resultB,
      accountB,
      waitSec,
      rejectWait,
    );
    ordersA = polled.ordersA;
    ordersB = polled.ordersB;
    rejectA = polled.rejectA;
    rejectB = polled.rejectB;
  }

  const binds: OrderBindRow[] = [];
  if (resultA?.success && accountA && ordersA.length) {
    binds.push({
      LinkID: linkId,
      Provider: resultA.provider,
      OrderID: ordersA[0].orderId,
    });
  }
  if (resultB?.success && accountB && ordersB.length) {
    binds.push({
      LinkID: linkId,
      Provider: resultB.provider,
      OrderID: ordersB[0].orderId,
    });
  }

  await applyArbMakeUpFromRejects(params, placed, rejectA, rejectB);
  if (resultA?.success && !rejectA && accountA) {
    markSuccessfulBet(accountA, bet.id, legA.target, legA.odds);
  }
  if (resultB?.success && !rejectB && accountB) {
    markSuccessfulBet(accountB, bet.id, legB.target, legB.odds);
  }

  if (binds.length) {
    await saveOrderBind({ orders: JSON.stringify(binds) });
  }

  const messagePeers = buildBettingMessagePeers(params, placed, rejectA, rejectB);
  if (messagePeers) {
    useMessageStore().bettingMessage(messagePeers[0], messagePeers[1]);
  }

  if (
    betBothLegs &&
    resultA?.success &&
    resultB?.success &&
    !rejectA &&
    !rejectB
  ) {
    scheduleDeferredArbRejectMakeUp(params, placed);
  }
}
