import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { VenueOrder } from "@venue/contract";
import { arbMakeUpSides } from "@/stores/betting/autoBet/arbMakeUpPair";
import { enqueueMakeUpOrder } from "@/stores/betting/autoBet/makeUp";
import { resolveMakeUpSuccessReference } from "@/stores/betting/makeUpReference";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

export interface ArbMakeUpVenueContext {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
}

export interface ArbMakeUpEnqueueResult {
  enqueuedForLegA: boolean;
  enqueuedForLegB: boolean;
}

/** 编排层判定需补单后入队；赔率/初赔阈值在 jb 消费时按盘口检查 */
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
  const result: ArbMakeUpEnqueueResult = {
    enqueuedForLegA: false,
    enqueuedForLegB: false,
  };

  if (!betBothLegs)
    return result;

  const side = arbMakeUpSides(resultA, rejectA, resultB, rejectB);

  if (side === "enqueueB" && accountA) {
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
  else if (side === "enqueueA" && accountB) {
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
