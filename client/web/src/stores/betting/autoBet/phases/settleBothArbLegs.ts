import type { VenueOrder } from "@changmen/venue-adapter/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import type {
  ArbBetAttemptParams,
  ArbBetPlaced,
  ArbLegPlaceOutcome,
} from "@/stores/betting/autoBet/phases/types";
import {
  legRejectWaitSec,
  maxLegRejectWaitSec,
  showRejectDetectionTip,
} from "@/stores/betting/autoBet/rejectWait";
import { settleArbLeg } from "@/stores/betting/autoBet/arbLegSettle";
import { bindArbLegOrder, resolveArbBindOrderId } from "@/stores/betting/arbOrderBind";
import { enqueuePendingOrderBind } from "@/stores/betting/pendingOrderBind";
import { syncActiveBetLegSettleResult, syncActiveBetPhase } from "@/stores/betting/activeBetRunSync";
import { useAccountStore } from "@/stores/accountStore";

export interface ArbLegSettleSnapshot {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
  pendingConfirmA: boolean;
  pendingConfirmB: boolean;
  /** place 回传；编排用，场馆层不改写 */
  placeOutcomeA: ArbLegPlaceOutcome;
  placeOutcomeB: ArbLegPlaceOutcome;
  boundLegLabels: string[];
  /** [changmen 扩展] Bind 最终失败的腿（已重试；有 orderId 可绑却失败） */
  bindFailedLegLabels: string[];
  bindFailedSides: Array<"A" | "B">;
}

function emptySettleSnapshot(
  placeOutcomeA: ArbLegPlaceOutcome,
  placeOutcomeB: ArbLegPlaceOutcome,
): ArbLegSettleSnapshot {
  return {
    ordersA: [],
    ordersB: [],
    rejectA: false,
    rejectB: false,
    pendingConfirmA: false,
    pendingConfirmB: false,
    placeOutcomeA,
    placeOutcomeB,
    boundLegLabels: [],
    bindFailedLegLabels: [],
    bindFailedSides: [],
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
    placeOutcomeA,
    placeOutcomeB,
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

  if (!successAccounts.length) {
    // 无 API 成功腿：不进场馆 settle；编排层仍用 placeOutcome 收尾
    if (accountA && placeOutcomeA !== "filled_pending_settle")
      syncActiveBetLegSettleResult(bet.id, "A", false, false);
    if (accountB && placeOutcomeB !== "filled_pending_settle")
      syncActiveBetLegSettleResult(bet.id, "B", false, false);
    return emptySettleSnapshot(placeOutcomeA, placeOutcomeB);
  }

  const snapshot = emptySettleSnapshot(placeOutcomeA, placeOutcomeB);
  const maxWait = maxLegRejectWaitSec(config, successAccounts);
  // wait=0（含纯 PM）：无 A8 拒单倒计时，相位用「确认场馆结果」避免误导
  if (maxWait > 0) {
    trace?.event("拒单", `各腿并行检测 / 最长 ${maxWait}s（场馆层）`);
    syncActiveBetPhase(bet.id, "settling", "拒单检测", maxWait);
    void showRejectDetectionTip(waitSec);
  }
  else {
    trace?.event("拒单", "确认场馆结果（无拒单等待）");
    syncActiveBetPhase(bet.id, "settling", "确认场馆结果");
  }

  const legTasks: Promise<void>[] = [];

  // API 失败 / 未下单腿：不上场馆 settle，只回编排态（避免误标「未拒单」）
  if (accountA && placeOutcomeA !== "filled_pending_settle")
    syncActiveBetLegSettleResult(bet.id, "A", false, false);
  if (accountB && placeOutcomeB !== "filled_pending_settle")
    syncActiveBetLegSettleResult(bet.id, "B", false, false);

  if (resultA?.success && accountA) {
    legTasks.push((async () => {
      const synced = await settleArbLeg(accountA, resultA, {
        rejectWaitSec: legRejectWaitSec(config, accountA.provider),
        pendingBindLinkId: linkId,
      });
      snapshot.ordersA = synced.orders;
      snapshot.rejectA = synced.rejected;
      snapshot.pendingConfirmA = synced.pendingConfirm;
      syncActiveBetLegSettleResult(bet.id, "A", true, snapshot.rejectA);
      const orderIdA = resolveArbBindOrderId(snapshot.ordersA, resultA, snapshot.rejectA);
      if (await bindArbLegOrder(linkId, accountA, resultA, snapshot.ordersA, snapshot.rejectA))
        snapshot.boundLegLabels.push(legA.type);
      else if (orderIdA) {
        snapshot.bindFailedLegLabels.push(legA.type);
        snapshot.bindFailedSides.push("A");
        enqueuePendingOrderBind({
          linkId,
          provider: resultA.provider,
          accountId: accountA.accountId,
          orderId: orderIdA,
          betId: bet.id,
          side: "A",
        });
      }
    })());
  }

  if (resultB?.success && accountB) {
    legTasks.push((async () => {
      const synced = await settleArbLeg(accountB, resultB, {
        rejectWaitSec: legRejectWaitSec(config, accountB.provider),
        pendingBindLinkId: linkId,
      });
      snapshot.ordersB = synced.orders;
      snapshot.rejectB = synced.rejected;
      snapshot.pendingConfirmB = synced.pendingConfirm;
      syncActiveBetLegSettleResult(bet.id, "B", true, snapshot.rejectB);
      const orderIdB = resolveArbBindOrderId(snapshot.ordersB, resultB, snapshot.rejectB);
      if (await bindArbLegOrder(linkId, accountB, resultB, snapshot.ordersB, snapshot.rejectB))
        snapshot.boundLegLabels.push(legB.type);
      else if (orderIdB) {
        snapshot.bindFailedLegLabels.push(legB.type);
        snapshot.bindFailedSides.push("B");
        enqueuePendingOrderBind({
          linkId,
          provider: resultB.provider,
          accountId: accountB.accountId,
          orderId: orderIdB,
          betId: bet.id,
          side: "B",
        });
      }
    })());
  }

  await Promise.all(legTasks);

  // 仅对已交场馆 settle 的腿报告拒单结果；API 失败/未下单不伪造成「未拒单」
  const rejectLine = (side: "A" | "B") => {
    const account = side === "A" ? accountA : accountB;
    const result = side === "A" ? resultA : resultB;
    const leg = side === "A" ? legA : legB;
    const outcome = side === "A" ? placed.placeOutcomeA : placed.placeOutcomeB;
    const rejected = side === "A" ? snapshot.rejectA : snapshot.rejectB;
    const pending = side === "A" ? snapshot.pendingConfirmA : snapshot.pendingConfirmB;
    if (!account)
      return null;
    if (result?.success) {
      if (pending)
        return `${leg.type} 待确认`;
      return `${leg.type} ${rejected ? "🔴拒单" : "否"}`;
    }
    if (outcome === "not_attempted")
      return `${leg.type} 未下单`;
    return `${leg.type} API失败`;
  };

  trace?.event(
    "拒单",
    [rejectLine("A"), rejectLine("B")].filter(Boolean).join(" · "),
  );

  return snapshot;
}
