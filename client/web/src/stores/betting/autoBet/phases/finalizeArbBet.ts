import type { VenueOrder } from "@venue/contract";
import type { OrderBindRow } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { BettingMessageLeg, BettingMessageSingleLegRatePeer } from "@/stores/messageStore";
import { saveOrderBind } from "@/api/esport";
import { findSingleLegRateAccount } from "@/domain/betting/singleLegRate";
import { opponentSide } from "@/models/betOption";
import { useAccountStore } from "@/stores/accountStore";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
import { rejectWaitSeconds, waitRejectDetection } from "@/stores/betting/autoBet/rejectWait";
import { syncVenueRejectFlags, resolveArbBindOrderId } from "@/stores/betting/autoBet/venueRejectSync";
import { shouldSendArbProgress } from "@/stores/betting/autoBet/arbProgressTrace";
import {
  syncActiveBetAfterRejectSync,
  syncActiveBetFail,
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

  if (successAccounts.length) {
    const rejectWait = rejectWaitSeconds(config, successAccounts);
    trace?.event("拒单", `等待 ${waitSec}s 展示 / 检测 ${rejectWait}s`);
    syncActiveBetPhase(bet.id, "settling", `拒单检测 ${waitSec}s`);
    await waitRejectDetection(waitSec, rejectWait);
    const synced = await syncVenueRejectFlags(resultA, accountA, resultB, accountB);
    ordersA = synced.ordersA;
    ordersB = synced.ordersB;
    rejectA = synced.rejectA;
    rejectB = synced.rejectB;
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

  const binds: OrderBindRow[] = [];
  const bindOrderA = resolveArbBindOrderId(ordersA, resultA);
  if (resultA?.success && accountA && bindOrderA) {
    binds.push({
      LinkID: linkId,
      Provider: resultA.provider,
      OrderID: bindOrderA,
    });
  }
  const bindOrderB = resolveArbBindOrderId(ordersB, resultB);
  if (resultB?.success && accountB && bindOrderB) {
    binds.push({
      LinkID: linkId,
      Provider: resultB.provider,
      OrderID: bindOrderB,
    });
  }

  const makeup = await applyArbMakeUpFromRejects(params, placed, rejectA, rejectB, {
    ordersA,
    ordersB,
  });
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

  if (binds.length) {
    await saveOrderBind({ orders: JSON.stringify(binds) });
    trace?.event("绑单", `linkId ${linkId} · ${binds.length} 笔`);
  }

  const okA = Boolean(resultA?.success && accountA && !rejectA);
  const okB = Boolean(resultB?.success && accountB && !rejectB);
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
