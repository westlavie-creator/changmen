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
import { wait } from "@changmen/client-core/shared/wait";

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

/** 本地一轮 timeout 后续跟（吃单须跟到成/不成）。PM FOK 在 sd 窗后应已是 unfilled，不再靠多轮空等。 */
export const PENDING_CONFIRM_FOLLOW_ROUNDS = 6;
export const PENDING_CONFIRM_FOLLOW_GAP_MS = 2_000;

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
      // 官方 delayed：matched 后 trades 可能滞后；等 orderId 出现再 save
      waitForOrderId: pendingBindOrderId,
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

/**
 * 跟到已成交 / 未成交。
 * timeout / 仍 pending → 续跟；耗尽仍未知则保持 pendingConfirm（禁止硬判未成交）。
 * 非 pending-confirm 馆：一轮即返回。
 */
export async function settleArbLegUntilTerminal(
  account: PlatformAccount,
  result?: BetResult,
  rejectWaitSecOrOpts?: number | SettleArbLegOpts,
): Promise<ArbLegSettleResult> {
  const needFollow = isPendingConfirmVenueProvider(account.provider) && Boolean(result);
  const rounds = needFollow ? PENDING_CONFIRM_FOLLOW_ROUNDS : 1;
  let last: ArbLegSettleResult = { orders: [], rejected: false, pendingConfirm: false };
  for (let round = 0; round < rounds; round++) {
    last = await settleArbLeg(account, result, rejectWaitSecOrOpts);
    if (!last.pendingConfirm)
      return last;
    if (round < rounds - 1)
      await wait(PENDING_CONFIRM_FOLLOW_GAP_MS * (round + 1));
  }
  return last;
}
