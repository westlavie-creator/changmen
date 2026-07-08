import type { VenueOrder } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import {
  legRejectWaitSec,
  maxLegRejectWaitSec,
  showRejectDetectionTip,
} from "@/stores/betting/autoBet/rejectWait";
import { settleArbLeg } from "@/stores/betting/autoBet/arbLegSettle";
import { bindArbLegOrder } from "@/stores/betting/arbOrderBind";
import { syncActiveBetLegSettleResult, syncActiveBetPhase } from "@/stores/betting/activeBetRunSync";
import { useAccountStore } from "@/stores/accountStore";

export interface ArbLegSettleSnapshot {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
  pendingConfirmA: boolean;
  pendingConfirmB: boolean;
  boundLegLabels: string[];
}

function emptySettleSnapshot(): ArbLegSettleSnapshot {
  return {
    ordersA: [],
    ordersB: [],
    rejectA: false,
    rejectB: false,
    pendingConfirmA: false,
    pendingConfirmB: false,
    boundLegLabels: [],
  };
}

/** 成功腿：刷余额、Oe tip、并行 settle + 绑单 */
export async function settleBothArbLegs(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): Promise<ArbLegSettleSnapshot> {
  const { bet, config, trace } = params;
  const accountStore = useAccountStore();
  const {
    legA,
    legB,
    accountA,
    accountB,
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

  if (!successAccounts.length)
    return emptySettleSnapshot();

  const snapshot = emptySettleSnapshot();
  const maxWait = maxLegRejectWaitSec(config, successAccounts);
  trace?.event("拒单", `各腿并行检测 / 最长 ${maxWait}s（场馆层）`);
  syncActiveBetPhase(bet.id, "settling", "拒单检测", maxWait > 0 ? maxWait : undefined);
  void showRejectDetectionTip(waitSec);

  const legTasks: Promise<void>[] = [];

  if (resultA?.success && accountA) {
    legTasks.push((async () => {
      const synced = await settleArbLeg(
        accountA,
        resultA,
        legRejectWaitSec(config, accountA.provider),
      );
      snapshot.ordersA = synced.orders;
      snapshot.rejectA = synced.rejected;
      snapshot.pendingConfirmA = synced.pendingConfirm;
      syncActiveBetLegSettleResult(bet.id, "A", true, snapshot.rejectA);
      if (await bindArbLegOrder(linkId, accountA, resultA, snapshot.ordersA, snapshot.rejectA))
        snapshot.boundLegLabels.push(legA.type);
    })());
  }

  if (resultB?.success && accountB) {
    legTasks.push((async () => {
      const synced = await settleArbLeg(
        accountB,
        resultB,
        legRejectWaitSec(config, accountB.provider),
      );
      snapshot.ordersB = synced.orders;
      snapshot.rejectB = synced.rejected;
      snapshot.pendingConfirmB = synced.pendingConfirm;
      syncActiveBetLegSettleResult(bet.id, "B", true, snapshot.rejectB);
      if (await bindArbLegOrder(linkId, accountB, resultB, snapshot.ordersB, snapshot.rejectB))
        snapshot.boundLegLabels.push(legB.type);
    })());
  }

  await Promise.all(legTasks);

  trace?.event(
    "拒单",
    [
      accountA ? `${legA.type} ${snapshot.rejectA ? "🔴拒单" : "否"}` : null,
      accountB ? `${legB.type} ${snapshot.rejectB ? "🔴拒单" : "否"}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  return snapshot;
}
