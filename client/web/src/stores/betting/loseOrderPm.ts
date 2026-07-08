import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";
import { wait } from "@/shared/wait";
import type { UserConfig } from "@/types/userConfig";
import { applyPmJbSettlementOutcome } from "@/stores/betting/loseOrderPmPending";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";
import {
  syncActiveBetMakeupPmDelayed,
  syncActiveBetMakeupSettling,
} from "@/stores/betting/activeBetRunSync";
import type { useLoseOrderStore } from "@/stores/loseOrderStore";

export interface PmMakeUpLegContext {
  betId: number;
  order: LoseOrder;
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
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
    config,
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

  const waitSec = makeUpBetToastSeconds(config, account.provider);
  if (waitSec > 0) {
    a8Tip("拒单检测", `等待<countdown>${waitSec}</countdown>秒`, waitSec * 1000);
    syncActiveBetMakeupSettling(betId, waitSec);
    await wait(waitSec * 1000);
  }

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
