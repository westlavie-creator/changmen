import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import { enqueueMakeUpOrder } from "@/stores/betting/autoBet/makeUp";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

/** 对齐 A8 bundle：一腿成且非拒、另一腿失败或拒 → 补单入队 */
export async function applyArbMakeUpFromRejects(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
  rejectA: boolean,
  rejectB: boolean,
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
    await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      accountId: accountA.accountId,
      target: legB.target,
      betMoney: legA.betMoney,
      betOdds: legA.odds,
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
    await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      accountId: accountB.accountId,
      target: legA.target,
      betMoney: legB.betMoney,
      betOdds: legB.odds,
      failedLegOdds: legA.odds,
      failedPlatformLabel: legA.type,
    });
  }
}
