import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { VenueOrder } from "@venue/contract";
import { enqueueMakeUpOrder } from "@/stores/betting/autoBet/makeUp";
import { resolveMakeUpSuccessReference } from "@/stores/betting/makeUpReference";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

export interface ArbMakeUpVenueContext {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
}

/** 对齐 A8 bundle：一腿成且非拒、另一腿失败或拒 → 补单入队 */
export async function applyArbMakeUpFromRejects(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
  rejectA: boolean,
  rejectB: boolean,
  venue: ArbMakeUpVenueContext = { ordersA: [], ordersB: [] },
): Promise<void> {
  const { match, bet, config, setMessage } = params;
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

  if (!betBothLegs)
    return;

  if (
    accountA
    && resultA?.success
    && !rejectA
    && (!resultB?.success || rejectB)
  ) {
    const successRef = resolveMakeUpSuccessReference(legA, venue.ordersA, rejectA);
    await enqueueMakeUpOrder({
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
    && resultB?.success
    && !rejectB
    && (!resultA?.success || rejectA)
  ) {
    const successRef = resolveMakeUpSuccessReference(legB, venue.ordersB, rejectB);
    await enqueueMakeUpOrder({
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
}
