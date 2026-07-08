import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { VenueOrder } from "@venue/contract";
import { enqueueMakeUpOrder } from "@/stores/betting/autoBet/makeUp";
import { resolveMakeUpSuccessReference } from "@/stores/betting/makeUpReference";
import {
  legFailedForMakeUpTarget,
  legSucceededForMakeUpAnchor,
} from "@/stores/betting/makeUpLegOutcome";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

export interface ArbMakeUpVenueContext {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  pendingConfirmA?: boolean;
  pendingConfirmB?: boolean;
}

export interface ArbMakeUpEnqueueResult {
  enqueuedForLegA: boolean;
  enqueuedForLegB: boolean;
}

/** 对齐 A8 bundle：一腿成且非拒、另一腿失败或拒 → 补单入队 */
export async function applyArbMakeUpFromRejects(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
  rejectA: boolean,
  rejectB: boolean,
  venue: ArbMakeUpVenueContext = { ordersA: [], ordersB: [] },
): Promise<ArbMakeUpEnqueueResult> {
  const { match, bet, config, setMessage } = params;
  const empty: ArbMakeUpEnqueueResult = { enqueuedForLegA: false, enqueuedForLegB: false };
  if (!config.makeUp)
    return empty;
  const loseStore = useLoseOrderStore();
  const {
    legA,
    legB,
    accountA,
    accountB,
    betBothLegs,
    linkId,
    resultA,
    resultB,
  } = placed;
  const pendingA = venue.pendingConfirmA ?? false;
  const pendingB = venue.pendingConfirmB ?? false;

  const result: ArbMakeUpEnqueueResult = {
    enqueuedForLegA: false,
    enqueuedForLegB: false,
  };

  if (!betBothLegs)
    return result;

  if (
    accountA
    && legSucceededForMakeUpAnchor(resultA, rejectA, pendingA)
    && legFailedForMakeUpTarget(resultB, rejectB, pendingB)
  ) {
    const successRef = resolveMakeUpSuccessReference(
      legA,
      venue.ordersA,
      rejectA,
      accountA,
      resultA?.orderId,
    );
    result.enqueuedForLegB = await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      accountId: accountA.accountId,
      target: legB.target,
      betMoney: successRef.betMoney,
      betOdds: successRef.betOdds,
      failedLegOdds: legB.odds,
      failedPlatformLabel: legB.type,
    });
  }
  if (
    accountB
    && legSucceededForMakeUpAnchor(resultB, rejectB, pendingB)
    && legFailedForMakeUpTarget(resultA, rejectA, pendingA)
  ) {
    const successRef = resolveMakeUpSuccessReference(
      legB,
      venue.ordersB,
      rejectB,
      accountB,
      resultB?.orderId,
    );
    result.enqueuedForLegA = await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      accountId: accountB.accountId,
      target: legA.target,
      betMoney: successRef.betMoney,
      betOdds: successRef.betOdds,
      failedLegOdds: legA.odds,
      failedPlatformLabel: legA.type,
    });
  }

  return result;
}
