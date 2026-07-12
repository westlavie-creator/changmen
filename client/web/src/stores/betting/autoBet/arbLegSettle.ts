import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@changmen/venue-adapter/contract";
import {
  isVenueLegConfirmedUnfilled,
  isVenueLegPendingConfirm,
} from "@changmen/venue-adapter/contract";
import { resolveVenueLegOutcome } from "@/domain/betting/resolveVenueLegOutcome";
import { useAccountStore } from "@/stores/accountStore";

export interface ArbLegSettleResult {
  orders: VenueOrder[];
  /** 确认未成交（可补单）；timeout 为 false */
  rejected: boolean;
  /** 仍待确认（官方 delay / 接口滞后）；不入补单、不绑拒单 */
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
    rejected: isVenueLegConfirmedUnfilled(outcome),
    pendingConfirm: isVenueLegPendingConfirm(outcome),
  };
}
