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

export interface ArbMakeUpPendingConfirm {
  pendingConfirmA?: boolean;
  pendingConfirmB?: boolean;
}

/** 编排层判定需补单后入队；赔率/初赔阈值在 jb 消费时按盘口检查 */
export async function applyArbMakeUpFromRejects(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
  rejectA: boolean,
  rejectB: boolean,
  venue: ArbMakeUpVenueContext = { ordersA: [], ordersB: [] },
  pending: ArbMakeUpPendingConfirm = {},
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

  const pendingConfirmA = Boolean(pending.pendingConfirmA);
  const pendingConfirmB = Boolean(pending.pendingConfirmB);

  // 一腿已成交 + 一腿仍待确认：挂 LoseOrder 续查原单（对齐 jb pendingPm），不立刻补新单
  const resumePending = async (
    pendingSide: "A" | "B",
  ): Promise<boolean> => {
    const pendingResult = pendingSide === "A" ? resultA : resultB;
    const pendingAccount = pendingSide === "A" ? accountA : accountB;
    const pendingLeg = pendingSide === "A" ? legA : legB;
    const anchorLeg = pendingSide === "A" ? legB : legA;
    const anchorOrders = pendingSide === "A" ? venue.ordersB : venue.ordersA;
    const anchorReject = pendingSide === "A" ? rejectB : rejectA;
    const anchorAccount = pendingSide === "A" ? accountB : accountA;
    const anchorResult = pendingSide === "A" ? resultB : resultA;
    const orderId = String(pendingResult?.orderId ?? "").trim();
    if (!pendingAccount || !anchorAccount || !orderId)
      return false;
    if (pendingAccount.provider !== "Polymarket")
      return false;
    if (loseStore.orders.has(bet.id)) {
      loseStore.setPendingPmOrder(bet.id, orderId, pendingAccount.accountId);
      return true;
    }
    const successRef = resolveMakeUpSuccessReference(
      anchorLeg,
      anchorOrders,
      anchorReject,
      anchorAccount,
      anchorResult?.orderId,
    );
    const enqueued = await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      // 锚腿账号（与确认拒单补单一致）；pendingPm 记 PM 原单供 jb 续查
      accountId: anchorAccount.accountId,
      target: pendingLeg.target,
      betMoney: successRef.betMoney,
      betOdds: successRef.betOdds,
      failedLegOdds: pendingLeg.odds,
      failedPlatformLabel: `${pendingLeg.type}(待确认续查)`,
    });
    if (enqueued)
      loseStore.setPendingPmOrder(bet.id, orderId, pendingAccount.accountId);
    return enqueued;
  };

  if (
    !rejectA && !rejectB
    && pendingConfirmA && !pendingConfirmB
    && resultB?.success && accountB
  ) {
    result.enqueuedForLegA = await resumePending("A");
    return result;
  }
  if (
    !rejectA && !rejectB
    && pendingConfirmB && !pendingConfirmA
    && resultA?.success && accountA
  ) {
    result.enqueuedForLegB = await resumePending("B");
    return result;
  }

  const side = arbMakeUpSides(
    resultA,
    rejectA,
    resultB,
    rejectB,
    pendingConfirmA,
    pendingConfirmB,
  );

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
