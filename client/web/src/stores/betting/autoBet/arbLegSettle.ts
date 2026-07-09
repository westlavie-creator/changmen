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

export interface SettleArbLegOpts {
  rejectWaitSec?: number;
  /** [changmen 扩展] SaveOrder 直写最终 Link，缩短占位窗口 */
  pendingBindLinkId?: number;
}

/** 套利单腿：场馆 resolveLegOutcome（wait → 拉单 / PM settle） */
export async function settleArbLeg(
  account: PlatformAccount,
  result?: BetResult,
  rejectWaitSecOrOpts?: number | SettleArbLegOpts,
): Promise<ArbLegSettleResult> {
  const opts: SettleArbLegOpts = typeof rejectWaitSecOrOpts === "number"
    || rejectWaitSecOrOpts == null
    ? { rejectWaitSec: rejectWaitSecOrOpts }
    : rejectWaitSecOrOpts;
  const pendingBindOrderId = String(result?.orderId ?? "").trim() || undefined;
  const outcome = await resolveVenueLegOutcome(
    account,
    result,
    () => useAccountStore().updateVenueOrders(account, {
      pendingBindLinkId: opts.pendingBindLinkId,
      pendingBindOrderId,
    }),
    {
      confirmPmPost: account.provider === "Polymarket" && Boolean(result),
      rejectWaitSec: opts.rejectWaitSec,
    },
  );
  return {
    orders: outcome.orders,
    rejected: isVenueLegRejected(outcome),
    pendingConfirm: isVenueLegPendingConfirm(outcome),
  };
}
