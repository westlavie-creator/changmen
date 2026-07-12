import type { BetOption } from "@changmen/client-core/models/betOption";
import type { BetResult } from "@changmen/client-core/models/betResult";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import { syncActiveBetMakeupPmDelayed } from "@/stores/betting/activeBetRunSync";
import { applyPmJbSettlementOutcome } from "@/stores/betting/loseOrderPmPending";
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

/** [changmen 扩展] PM 补单 jb：拒单等待 → adapter 状态层 → 收尾 */
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
    syncActiveBetMakeupPmDelayed(betId, result.orderId);

  await applyPmJbSettlementOutcome({
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
  markSuccessfulBet(account, bet.id, order.target);
}

export type { PmJbResumeResult, PmJbSettlementOutcome } from "@/stores/betting/loseOrderPmPending";
export { tryResumePmPendingMakeUp } from "@/stores/betting/loseOrderPmPending";
