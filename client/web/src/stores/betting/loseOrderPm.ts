import type { BetOption } from "@changmen/client-core/models/betOption";
import type { BetResult } from "@changmen/client-core/models/betResult";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import { syncActiveBetMakeupPendingConfirm } from "@/stores/betting/activeBetRunSync";
import { applyVenueJbSettlementOutcome } from "@/stores/betting/loseOrderPmPending";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";
import type { useLoseOrderStore } from "@/stores/loseOrderStore";

export interface PmMakeUpLegContext {
  betId: number;
  order: LoseOrder;
  match: ViewMatch;
  bet: ViewBet;
  account: PlatformAccount;
  checked: BetOption;
  result: BetResult;
  platformLabel: string;
  loseStore: ReturnType<typeof useLoseOrderStore>;
  removeIds: Set<number>;
  setMessage: (msg: string) => void;
}

/** [changmen 扩展] 受理后确认场馆补单 jb：拒单等待 → adapter 状态层 → 收尾 */
export async function processPmMakeUpLeg(ctx: PmMakeUpLegContext): Promise<void> {
  const {
    betId,
    order,
    match,
    bet,
    account,
    checked,
    result,
    platformLabel,
    loseStore,
    removeIds,
    setMessage,
  } = ctx;

  if (result.pending)
    syncActiveBetMakeupPendingConfirm(betId, result.orderId);

  const outcome = await applyVenueJbSettlementOutcome({
    betId,
    order,
    match,
    bet,
    account,
    result,
    checked,
    platformLabel,
    loseStore,
    removeIds,
    setMessage,
  });
  if (outcome === "dequeued")
    markSuccessfulBet(account, bet.id, order.target);
}

export type {
  VenueJbResumeResult,
  VenueJbSettlementOutcome,
  PmJbResumeResult,
  PmJbSettlementOutcome,
} from "@/stores/betting/loseOrderPmPending";
export {
  tryResumePendingVenueMakeUp,
  tryResumePmPendingMakeUp,
} from "@/stores/betting/loseOrderPmPending";
