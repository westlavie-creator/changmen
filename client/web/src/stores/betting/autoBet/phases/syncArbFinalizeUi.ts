import type { ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { ArbLegSettleSnapshot } from "@/stores/betting/autoBet/phases/settleBothArbLegs";
import type { ArbMakeUpEnqueueResult } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
import { syncActiveBetAfterRejectSync } from "@/stores/betting/activeBetRunSync";

export interface ArbFinalizeOutcome {
  okA: boolean;
  okB: boolean;
  makeupQueued: boolean;
}

export function syncArbFinalizeActiveBet(
  betId: number,
  placed: ArbBetPlaced,
  settle: ArbLegSettleSnapshot,
  makeup: ArbMakeUpEnqueueResult,
): ArbFinalizeOutcome {
  const { legA, legB, accountA, accountB, resultA, resultB } = placed;
  const okA = Boolean(resultA?.success && accountA && !settle.rejectA && !settle.pendingConfirmA);
  const okB = Boolean(resultB?.success && accountB && !settle.rejectB && !settle.pendingConfirmB);
  const makeupQueued = makeup.enqueuedForLegA || makeup.enqueuedForLegB;

  let makeupTarget: "A" | "B" | undefined;
  let makeupPlatform: string | undefined;
  if (makeup.enqueuedForLegB) {
    makeupTarget = "B";
    makeupPlatform = legB.type;
  }
  else if (makeup.enqueuedForLegA) {
    makeupTarget = "A";
    makeupPlatform = legA.type;
  }

  syncActiveBetAfterRejectSync(betId, {
    hasA: Boolean(accountA),
    hasB: Boolean(accountB),
    rejectA: settle.rejectA,
    rejectB: settle.rejectB,
    okA,
    okB,
    makeupQueued,
    makeupTarget,
    makeupPlatform,
  });

  return { okA, okB, makeupQueued };
}
