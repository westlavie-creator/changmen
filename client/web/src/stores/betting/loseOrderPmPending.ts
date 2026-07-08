import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetOption as BetOptionCtor } from "@/models/betOption";
import { BetResult as BetResultCtor } from "@/models/betResult";
import { a8Tip } from "@/shared/a8Notify";
import { PLATFORMS } from "@/shared/platform";
import type { useAccountStore } from "@/stores/accountStore";
import {
  bindArbLegOrder,
  refreshOrderListAfterBind,
} from "@/stores/betting/arbOrderBind";
import { syncVenueOrdersWithRejectForLeg } from "@/stores/betting/autoBet/venueRejectSync";
import type { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMessageStore } from "@/stores/messageStore";
import {
  syncActiveBetMakeupDone,
  syncActiveBetMakeupRejected,
  syncActiveBetPhase,
} from "@/stores/betting/activeBetRunSync";

export type PmJbSettlementOutcome = "dequeued" | "pending" | "rejected";

export interface PmJbSettlementContext {
  betId: number;
  order: LoseOrder;
  match: ViewMatch;
  bet: ViewBet;
  account: PlatformAccount;
  result: BetResult;
  checked: BetOption;
  platformLabel: string;
  loseStore: ReturnType<typeof useLoseOrderStore>;
  removeIds: Set<number>;
  setMessage: (msg: string) => void;
}

function isPmTimeoutReject(result: BetResult): boolean {
  return result.reject === "timeout";
}

/** PM jb：sync 后按 matched / timeout / unfilled 收尾 */
export async function applyPmJbSettlementOutcome(
  ctx: PmJbSettlementContext,
): Promise<PmJbSettlementOutcome> {
  const {
    betId,
    order,
    account,
    result,
    checked,
    platformLabel,
    loseStore,
    removeIds,
    setMessage,
  } = ctx;

  const { orders: venueOrders, rejected } = await syncVenueOrdersWithRejectForLeg(
    account,
    result,
  );

  if (!rejected) {
    loseStore.clearPendingPmOrder(betId);
    await bindArbLegOrder(order.linkId, account, result, venueOrders, false);
    refreshOrderListAfterBind();
    removeIds.add(betId);
    setMessage(`补单成功 ${platformLabel}@${checked.odds}`);
    syncActiveBetMakeupDone(betId, platformLabel, checked.odds);
    useMessageStore().loseOrderMessage(account, order, checked, false);
    return "dequeued";
  }

  if (isPmTimeoutReject(result)) {
    loseStore.setPendingPmOrder(betId, String(result.orderId ?? ""), account.accountId);
    setMessage(`PM 订单待确认，下轮续查 ${String(result.orderId ?? "").slice(0, 10)}…`);
    syncActiveBetPhase(betId, "makeup", "PM 订单待确认");
    useMessageStore().loseOrderMessage(account, order, checked, true);
    return "pending";
  }

  loseStore.clearPendingPmOrder(betId);
  await bindArbLegOrder(order.linkId, account, result, venueOrders, true);
  refreshOrderListAfterBind();
  setMessage(`${order.target} 再次被拒单`);
  a8Tip("拒单提醒", `${order.target} 再次被拒单`, 3000);
  syncActiveBetMakeupRejected(betId, order.target);
  useMessageStore().loseOrderMessage(account, order, checked, true);
  return "rejected";
}

export type PmJbResumeResult = "not-applicable" | "handled";

/** 队列项已有 pendingPmOrderId 时续轮 settle，不再 POST */
export async function tryResumePmPendingMakeUp(params: {
  betId: number;
  order: LoseOrder;
  match: ViewMatch;
  bet: ViewBet;
  accountStore: ReturnType<typeof useAccountStore>;
  loseStore: ReturnType<typeof useLoseOrderStore>;
  removeIds: Set<number>;
  setMessage: (msg: string) => void;
  markSuccess: (account: PlatformAccount) => void;
}): Promise<PmJbResumeResult> {
  const {
    betId,
    order,
    match,
    bet,
    accountStore,
    loseStore,
    removeIds,
    setMessage,
    markSuccess,
  } = params;

  const pendingId = String(order.pendingPmOrderId ?? "").trim();
  if (!pendingId)
    return "not-applicable";

  const account = accountStore.findAccount(order.pendingPmAccountId);
  if (!account || account.provider !== PLATFORMS.Polymarket)
    return "not-applicable";

  const ref = bet.items.find(item => item.type === PLATFORMS.Polymarket);
  if (!ref) {
    loseStore.clearPendingPmOrder(betId);
    return "not-applicable";
  }

  const sideOdds = ref.getOdds(order.target);
  const checked = new BetOptionCtor(match, bet, ref, order.target, order.getBetMoney(sideOdds));
  checked.loseOrder = true;

  const result = Object.assign(new BetResultCtor(PLATFORMS.Polymarket, true), {
    orderId: pendingId,
    pending: true,
  });

  const outcome = await applyPmJbSettlementOutcome({
    betId,
    order,
    match,
    bet,
    account,
    result,
    checked,
    platformLabel: ref.type,
    loseStore,
    removeIds,
    setMessage,
  });

  if (outcome === "dequeued")
    markSuccess(account);

  return "handled";
}
