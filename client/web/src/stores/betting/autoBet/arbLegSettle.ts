import type { BetOption } from "@changmen/client-core/models/betOption";
import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { VenueOrder } from "@changmen/venue-adapter/contract";
import {
  isVenueLegConfirmedUnfilled,
  isVenueLegPendingConfirm,
} from "@changmen/venue-adapter/contract";
import { resolveVenueLegOutcome } from "@/domain/betting/resolveVenueLegOutcome";
import { useAccountStore } from "@/stores/accountStore";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";
import { persistPolymarketExecutionReject } from "@/stores/account/pmRejectOrder";

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
  /** [changmen 扩展] PM 未成交落库用（stake/盘口） */
  betOption?: BetOption;
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
      confirmPostAccepted: isPendingConfirmVenueProvider(account.provider) && Boolean(result),
      rejectWaitSec: opts.rejectWaitSec,
    },
  );
  const rejected = isVenueLegConfirmedUnfilled(outcome);
  // PM unfilled：落库 Reject；timeout 不算拒单、不落库
  if (rejected && result && String(account.provider ?? "").trim() === "Polymarket") {
    try {
      await persistPolymarketExecutionReject(account, result, "unfilled", {
        betOption: opts.betOption,
        linkId: opts.pendingBindLinkId,
      });
    }
    catch {
      /* 拒单落库失败不阻断 settle 回传 */
    }
  }
  return {
    orders: outcome.orders,
    rejected,
    pendingConfirm: isVenueLegPendingConfirm(outcome),
  };
}
