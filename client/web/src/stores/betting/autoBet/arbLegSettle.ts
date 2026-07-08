import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@venue/contract";
import { isVenueLegPendingConfirm, isVenueLegRejected } from "@venue/contract";
import { resolveVenueLegOutcome } from "@/domain/betting/resolveVenueLegOutcome";
import { useAccountStore } from "@/stores/accountStore";

export interface ArbLegSettleResult {
  orders: VenueOrder[];
  rejected: boolean;
  pendingConfirm: boolean;
}

/** 套利单腿：场馆 resolveLegOutcome（wait → 拉单 / PM settle） */
export async function settleArbLeg(
  account: PlatformAccount,
  result?: BetResult,
  rejectWaitSec?: number,
): Promise<ArbLegSettleResult> {
  const outcome = await resolveVenueLegOutcome(
    account,
    result,
    () => useAccountStore().updateVenueOrders(account),
    {
      confirmPmPost: account.provider === "Polymarket" && Boolean(result),
      rejectWaitSec,
    },
  );
  return {
    orders: outcome.orders,
    rejected: isVenueLegRejected(outcome),
    pendingConfirm: isVenueLegPendingConfirm(outcome),
  };
}
