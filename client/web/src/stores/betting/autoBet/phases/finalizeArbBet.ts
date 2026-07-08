import type { VenueOrder } from "@venue/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { BettingMessageLeg, BettingMessageSingleLegRatePeer } from "@/stores/messageStore";
import { findSingleLegRateAccount } from "@/domain/betting/singleLegRate";
import { opponentSide } from "@/models/betOption";
import { useAccountStore } from "@/stores/accountStore";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
import {
  legRejectWaitSec,
  maxLegRejectWaitSec,
  showRejectDetectionTip,
} from "@/stores/betting/autoBet/rejectWait";
import {
  syncVenueOrdersWithRejectForLeg,
} from "@/stores/betting/autoBet/venueRejectSync";
import { shouldSendArbProgress } from "@/stores/betting/autoBet/arbProgressTrace";
import {
  bindArbLegOrder,
  refreshOrderListAfterBind,
} from "@/stores/betting/arbOrderBind";
import {
  syncActiveBetAfterRejectSync,
  syncActiveBetFail,
  syncActiveBetLegSettleResult,
  syncActiveBetPhase,
} from "@/stores/betting/activeBetRunSync";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/successMarkers";
import { useMatchStore } from "@/stores/matchStore";
import {

  useMessageStore,
} from "@/stores/messageStore";

function singleLegRatePeer(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): BettingMessageSingleLegRatePeer | null {
  const { match, bet, config } = params;
  const { legA, legB, accountA, accountB } = placed;
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();

  if (accountA && accountB)
    return null;

  const skippedLeg = accountA ? legB : legA;
  const exclude = config.noSameBet
    ? readUsedAccounts(bet.id, opponentSide(skippedLeg.target))
    : [];
  const rateAccount = findSingleLegRateAccount(
    skippedLeg,
    bet,
    match,
    accountStore.accounts,
    exclude,
    matchStore,
    placed.implied,
  );
  const platformLabel
    = rateAccount?.platformName
      || rateAccount?.provider
      || skippedLeg.type;
  return {
    kind: "singleLegRate",
    options: skippedLeg,
    platformLabel,
  };
}

function buildBettingMessagePeers(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
  rejectA: boolean,
  rejectB: boolean,
): [BettingMessageLeg | BettingMessageSingleLegRatePeer, BettingMessageLeg | BettingMessageSingleLegRatePeer] | null {
  const { legA, legB, accountA, accountB, resultA, resultB, betBothLegs } = placed;
  if (!resultA && !resultB)
    return null;
  if (!(resultA?.success || resultB?.success))
    return null;

  if (betBothLegs && accountA && accountB && resultA && resultB) {
    return [
      { account: accountA, result: resultA, options: legA, reject: rejectA },
      { account: accountB, result: resultB, options: legB, reject: rejectB },
    ];
  }

  const skipped = singleLegRatePeer(params, placed);
  if (!skipped)
    return null;

  if (accountA && resultA?.success) {
    return [
      { account: accountA, result: resultA, options: legA, reject: rejectA },
      skipped,
    ];
  }
  if (accountB && resultB?.success) {
    return [
      skipped,
      { account: accountB, result: resultB, options: legB, reject: rejectB },
    ];
  }
  return null;
}

/** 拒单等待、补单入队、成功标记、绑单、消息（顺序对齐 A8 bundle） */
export async function finalizeArbBet(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): Promise<void> {
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
    // [A8 可证实] bundle：`Y.updateBalance()` 不 await，与拒单等待并行
    void accountStore.refreshBalance(accountA);
  }
  if (resultB?.success && accountB) {
    successAccounts.push(accountB);
    void accountStore.refreshBalance(accountB);
  }

  let ordersA: VenueOrder[] = [];
  let ordersB: VenueOrder[] = [];
  let rejectA = false;
  let rejectB = false;
  let pendingConfirmA = false;
  let pendingConfirmB = false;
  const boundLegLabels: string[] = [];

  if (successAccounts.length) {
    const maxWait = maxLegRejectWaitSec(config, successAccounts);
    trace?.event("拒单", `各腿并行检测 / 最长 ${maxWait}s（场馆层）`);
    syncActiveBetPhase(bet.id, "settling", "拒单检测", maxWait > 0 ? maxWait : undefined);
    void showRejectDetectionTip(waitSec);

    const legTasks: Promise<void>[] = [];

    if (resultA?.success && accountA) {
      legTasks.push((async () => {
        const synced = await syncVenueOrdersWithRejectForLeg(
          accountA,
          resultA,
          legRejectWaitSec(config, accountA.provider),
        );
        ordersA = synced.orders;
        rejectA = synced.rejected;
        pendingConfirmA = synced.pendingConfirm;
        syncActiveBetLegSettleResult(bet.id, "A", true, rejectA);
        if (await bindArbLegOrder(linkId, accountA, resultA, ordersA, rejectA))
          boundLegLabels.push(legA.type);
      })());
    }

    if (resultB?.success && accountB) {
      legTasks.push((async () => {
        const synced = await syncVenueOrdersWithRejectForLeg(
          accountB,
          resultB,
          legRejectWaitSec(config, accountB.provider),
        );
        ordersB = synced.orders;
        rejectB = synced.rejected;
        pendingConfirmB = synced.pendingConfirm;
        syncActiveBetLegSettleResult(bet.id, "B", true, rejectB);
        if (await bindArbLegOrder(linkId, accountB, resultB, ordersB, rejectB))
          boundLegLabels.push(legB.type);
      })());
    }

    await Promise.all(legTasks);

    trace?.event(
      "拒单",
      [
        accountA ? `${legA.type} ${rejectA ? "🔴拒单" : "否"}` : null,
        accountB ? `${legB.type} ${rejectB ? "🔴拒单" : "否"}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  const makeup = await applyArbMakeUpFromRejects(params, placed, rejectA, rejectB, {
    ordersA,
    ordersB,
    pendingConfirmA,
    pendingConfirmB,
  });
  if (boundLegLabels.length)
    trace?.event("绑单", `linkId ${linkId} · ${boundLegLabels.join(" + ")}`);
  if (makeup.enqueuedForLegB) {
    trace?.event("补单", `已入队 ${legB.type} ${legB.target}`);
  }
  if (makeup.enqueuedForLegA) {
    trace?.event("补单", `已入队 ${legA.type} ${legA.target}`);
  }
  if (resultA?.success && !rejectA && accountA) {
    markSuccessfulBet(accountA, bet.id, legA.target, legA.odds);
  }
  if (resultB?.success && !rejectB && accountB) {
    markSuccessfulBet(accountB, bet.id, legB.target, legB.odds);
  }

  refreshOrderListAfterBind();

  const okA = Boolean(resultA?.success && accountA && !rejectA && !pendingConfirmA);
  const okB = Boolean(resultB?.success && accountB && !rejectB && !pendingConfirmB);
  const makeupQueued = makeup.enqueuedForLegA || makeup.enqueuedForLegB;

  let makeupTarget: "A" | "B" | undefined;
  let makeupPlatform: string | undefined;
  if (makeup.enqueuedForLegB) {
    makeupTarget = "B";
    makeupPlatform = legB.type;
  }
  else if (makeup.enqueuedForLegA) {
    makeupTarget = "A";
    makeupPlatform = legA.type;
  }

  syncActiveBetAfterRejectSync(bet.id, {
    hasA: Boolean(accountA),
    hasB: Boolean(accountB),
    rejectA,
    rejectB,
    okA,
    okB,
    makeupQueued,
    makeupTarget,
    makeupPlatform,
  });

  if (okA && okB) {
    trace?.finish("success", "双腿成单");
  }
  else if (resultA?.success || resultB?.success) {
    const parts = [
      okA ? `${legA.type} 成` : null,
      okB ? `${legB.type} 成` : null,
      rejectA || rejectB ? "含拒单" : null,
      makeupQueued ? "已入补单" : null,
    ].filter(Boolean);
    trace?.finish("partial", parts.join(" · ") || "部分成功");
  }
  else {
    trace?.finish("fail", "收尾无成功腿");
    syncActiveBetFail(bet.id, "收尾无成功腿");
  }

  const messagePeers = buildBettingMessagePeers(params, placed, rejectA, rejectB);
  // 已开「套利进度报告」时由 trace.finish → formatArbProgressTelegramBody 推送，避免旧版 📣下单提醒 覆盖新格式
  if (messagePeers && !(trace && shouldSendArbProgress())) {
    useMessageStore().bettingMessage(messagePeers[0], messagePeers[1]);
  }
}
