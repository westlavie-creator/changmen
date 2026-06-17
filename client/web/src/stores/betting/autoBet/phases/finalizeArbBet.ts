import { saveOrderBind } from "@/api/esport";
import type { PlatformAccount } from "@/models/platformAccount";
import type { OrderBindRow } from "@/models/betResult";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useOrderStore } from "@/stores/orderStore";
import { useMessageStore } from "@/stores/messageStore";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";
import { enqueueMakeUpOrder } from "@/stores/betting/autoBet/makeUp";
import { rejectWaitSeconds, waitRejectDetection } from "@/stores/betting/autoBet/rejectWait";
import { syncVenueRejectFlags } from "@/stores/betting/autoBet/venueRejectSync";
import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";

/** 拒单等待、绑单、消息、补单入队、成功标记、拉订单 */
export async function finalizeArbBet(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): Promise<void> {
  const { match, bet, config, setMessage } = params;
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const orderStore = useOrderStore();
  const {
    legA,
    legB,
    accountA,
    accountB,
    trace,
    betBothLegs,
    linkId,
    strictA8,
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

  if (successAccounts.length) {
    const rejectWait = rejectWaitSeconds(config, successAccounts);
    await waitRejectDetection(waitSec, rejectWait);
  }

  const { ordersA, ordersB, rejectA, rejectB } = await syncVenueRejectFlags(
    resultA,
    accountA,
    resultB,
    accountB,
  );

  const binds: OrderBindRow[] = [];
  if (resultA?.success && accountA && ordersA.length) {
    binds.push({
      LinkID: linkId,
      Provider: resultA.provider,
      OrderID: ordersA[0].orderId,
    });
  }
  if (resultB?.success && accountB && ordersB.length) {
    binds.push({
      LinkID: linkId,
      Provider: resultB.provider,
      OrderID: ordersB[0].orderId,
    });
  }
  if (strictA8 || binds.length) {
    await saveOrderBind({ orders: JSON.stringify(binds) });
  }

  // [A8 可证实] (Pe.success||ve.success) && BettingMessage（双腿场景；扩展单边无 accountB 则不推）
  if (
    accountA &&
    accountB &&
    resultA &&
    resultB &&
    (resultA.success || resultB.success)
  ) {
    useMessageStore().bettingMessage(
      { account: accountA, result: resultA, options: legA, reject: rejectA },
      { account: accountB, result: resultB, options: legB, reject: rejectB },
    );
  }

  if (
    betBothLegs &&
    accountA &&
    resultA?.success &&
    !rejectA &&
    (!resultB?.success || rejectB) &&
    config.makeUp
  ) {
    await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      accountId: accountA.accountId,
      target: legB.target,
      betMoney: legA.betMoney,
      betOdds: legA.odds,
      failedLegOdds: legB.odds,
      failedPlatformLabel: legB.type,
    });
  } else if (
    betBothLegs &&
    accountB &&
    resultB?.success &&
    !rejectB &&
    (!resultA?.success || rejectA) &&
    config.makeUp
  ) {
    await enqueueMakeUpOrder({
      loseStore,
      match,
      bet,
      config,
      setMessage,
      linkId,
      accountId: accountB.accountId,
      target: legA.target,
      betMoney: legB.betMoney,
      betOdds: legB.odds,
      failedLegOdds: legA.odds,
      failedPlatformLabel: legA.type,
    });
  }

  if (resultA?.success && !rejectA && accountA) {
    markSuccessfulBet(accountA, bet.id, legA.target, legA.odds, match.game);
  }
  if (resultB?.success && !rejectB && accountB) {
    markSuccessfulBet(accountB, bet.id, legB.target, legB.odds, match.game);
  }

  if (!strictA8 && !betBothLegs && (resultA?.success || resultB?.success)) {
    trace.finish("partial", "单边下单成功");
  }

  if (!strictA8 && (resultA?.success || resultB?.success)) {
    await orderStore.fetchOrders();
  }
}
