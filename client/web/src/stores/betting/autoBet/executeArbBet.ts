import { saveOrderBind } from "@/api/esport";
import { BetOption, opponentSide } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult, type OrderBindRow } from "@/models/betResult";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { isVenueReject } from "@/domain/betting";
import type { VenueOrder } from "@platform/contract";
import { betToastSeconds } from "@/shared/betTiming";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";
import { isA8StrictMode } from "@/shared/a8Strict";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOrderStore } from "@/stores/orderStore";
import { useMessageStore } from "@/stores/messageStore";
import { arbAccountPickerFilter } from "@/extensions/arbBet/rate9999";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/successMarkers";
import { enqueueMakeUpOrder } from "@/stores/betting/autoBet/makeUp";
import { rejectWaitSeconds, waitRejectDetection } from "@/stores/betting/autoBet/rejectWait";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";
import { createArbFlowTrace } from "@/extensions/arbBet/betTrace";

function formatCheckFailDetail(leg: BetOption): string {
  const err = leg.checkError?.trim();
  if (err) return err;
  const res = leg.response as { status?: string; data?: string } | undefined;
  const data = String(res?.data ?? "").trim();
  if (data) return data;
  if (res?.status && res.status !== "true") return `status=${res.status}`;
  return "失败";
}

function traceCheckLegs(
  trace: ReturnType<typeof createArbFlowTrace>,
  legA: BetOption,
  legB: BetOption,
  accountA: PlatformAccount | undefined,
  accountB: PlatformAccount | undefined,
) {
  if (accountA) {
    trace.event(
      "预检",
      `${legA.type} ${legA.data ? "✅" : `❌ ${formatCheckFailDetail(legA)}`}`,
    );
  }
  if (accountB) {
    trace.event(
      "预检",
      `${legB.type} ${legB.data ? "✅" : `❌ ${formatCheckFailDetail(legB)}`}`,
    );
  }
}

function traceBetLeg(
  trace: ReturnType<typeof createArbFlowTrace>,
  leg: BetOption,
  account: PlatformAccount | undefined,
  result: BetResult | undefined,
) {
  if (!account) return;
  trace.event(
    "下单",
    `${leg.type}/${account.playerName} ${result?.success ? "✅" : `❌ ${result?.message ?? "失败"}`}`,
  );
}

/** 单场单 bet 行的自动套利执行（选号、check、place、重试、绑单、补单、成功标记） */
export async function executeArbBet(params: {
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
}): Promise<void> {
  const { match, bet, config, setMessage } = params;
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const orderStore = useOrderStore();
  const strictA8 = isA8StrictMode();

  if (loseStore.orders.has(bet.id)) return;

  bet.items.forEach((item) => item.updateOdds());

  const providerKeys = [...accountStore.getProviders().keys()] as PlatformId[];
  const options = bet.getOrderOptions(match, config, accountStore.accounts, providerKeys);
  if (!options || options.length !== 2) return;

  let legA = options[0];
  let legB = options[1];
  const implied = 1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);
  const trace = createArbFlowTrace(match, bet, {
    implied,
    homeLine: `${legA.type}@${legA.odds}`,
    awayLine: `${legB.type}@${legB.odds}`,
  });

  let accountA = accountStore.getAccount(
    legA.type,
    legA.betMoney,
    config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [],
    (acc) => arbAccountPickerFilter(acc, bet, match, legA, matchStore, implied),
    options,
  );
  let accountB = accountStore.getAccount(
    legB.type,
    legB.betMoney,
    config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [],
    (acc) => arbAccountPickerFilter(acc, bet, match, legB, matchStore, implied),
    options,
  );
  if (!accountA && !accountB) {
    trace.finish("fail", "无可用账号");
    return;
  }

  if (accountA) trace.event("选号", `${accountA.provider}/${accountA.playerName}`);
  if (accountB) trace.event("选号", `${accountB.provider}/${accountB.playerName}`);

  let betBothLegs = Boolean(accountA) && Boolean(accountB);
  let linkId: number;

  if (strictA8) {
    if (!betBothLegs) {
      trace.finish("fail", "严格模式需双腿账号");
      return;
    }
    linkId = Date.now();
  } else {
    const { allowArbBetExecution, createArbLinkId, resolveRate9999SingleLeg } =
      await import("@/extensions/arbBet");
    const excludeA = config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [];
    const excludeB = config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [];
    const rate9999SingleLeg = resolveRate9999SingleLeg({
      betBothLegs,
      accountA,
      accountB,
      legA,
      legB,
      bet,
      match,
      accounts: accountStore.accounts,
      excludeA,
      excludeB,
      matchStore,
      implied,
    });
    if (!allowArbBetExecution(betBothLegs, rate9999SingleLeg)) {
      trace.finish("skip", "不满足下单条件");
      return;
    }
    linkId = createArbLinkId(rate9999SingleLeg);
  }

  if (accountA) accountA.active = true;
  if (accountB) accountB.active = true;
  const checkStart = Date.now();
  const checkTasks: Promise<BetOption>[] = [];
  if (accountA) checkTasks.push(accountStore.checkBetting(accountA, legA));
  if (accountB) checkTasks.push(accountStore.checkBetting(accountB, legB));
  const checked = await Promise.all(checkTasks);
  let checkIdx = 0;
  if (accountA) legA = checked[checkIdx++];
  if (accountB) legB = checked[checkIdx++];
  if ((accountA && !legA.data) || (accountB && !legB.data)) {
    traceCheckLegs(trace, legA, legB, accountA, accountB);
    trace.finish("fail", "预检未通过");
    await wait(1000);
    return;
  }

  // [A8 可证实] orderIndex 在 checkTimeout 之前赋值
  if (accountA) legA.orderIndex = 1;
  if (accountB) legB.orderIndex = strictA8 || betBothLegs ? 2 : 1;
  if (config.checkTimeout && Date.now() - checkStart > config.checkTimeout) {
    const elapsed = Date.now() - checkStart;
    const msg = `超时时间：${elapsed}ms，大于设定值：${config.checkTimeout}ms`;
    setMessage(`前置检查超时 ${elapsed}ms`);
    a8Tip("前置检查超时", msg, 3000);
    trace.finish("fail", msg);
    return;
  }

  const waitSec = Math.max(
    accountA ? betToastSeconds(config, accountA.provider) : 0,
    accountB ? betToastSeconds(config, accountB.provider) : 0,
  );

  let resultA: BetResult | undefined;
  let resultB: BetResult | undefined;
  if (!strictA8 && !betBothLegs) {
    if (accountA) {
      resultA = await accountStore.betting(accountA, legA, waitSec);
      traceBetLeg(trace, legA, accountA, resultA);
      if (!resultA?.success) {
        trace.finish("fail", "单边下单失败");
        return;
      }
    } else {
      resultB = await accountStore.betting(accountB!, legB, waitSec);
      traceBetLeg(trace, legB, accountB, resultB);
      if (!resultB?.success) {
        trace.finish("fail", "单边下单失败");
        return;
      }
    }
  } else if (config.betSorting === "Parallel") {
    const pair = await Promise.all([
      accountStore.betting(accountA!, legA, waitSec),
      accountStore.betting(accountB!, legB, waitSec),
    ]);
    resultA = pair[0];
    resultB = pair[1];
    if (resultA?.success || !pair.some((r) => r?.success)) {
      // keep leg/account assignment
    } else if (resultB?.success) {
      [legA, legB] = [legB, legA];
      [accountA, accountB] = [accountB, accountA];
      resultA = pair[1];
      resultB = pair[0];
    }
    if (!resultA?.success) {
      traceBetLeg(trace, legA, accountA, resultA);
      traceBetLeg(trace, legB, accountB, resultB);
      trace.finish("fail", "双腿下单均失败");
      return;
    }
  } else {
    resultA = await accountStore.betting(accountA!, legA, waitSec);
    traceBetLeg(trace, legA, accountA, resultA);
    if (!resultA.success) {
      trace.finish("fail", "首腿下单失败");
      return;
    }
    resultB = await accountStore.betting(accountB!, legB, waitSec);
    traceBetLeg(trace, legB, accountB, resultB);
  }

  if (betBothLegs && resultA?.success && !resultB?.success) {
    const retry = await retryFailedLeg(match, bet, legA, legB, config, waitSec);
    if (retry) {
      resultB = retry.result;
      legB = retry.leg;
      accountB = retry.account;
    }
  }

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

  let ordersA: VenueOrder[] = [];
  let ordersB: VenueOrder[] = [];
  let rejectA = false;
  let rejectB = false;
  if (resultA?.success && accountA) {
    ordersA = (await accountStore.updateVenueOrders(accountA)) ?? [];
    rejectA = isVenueReject(ordersA);
  }
  if (resultB?.success && accountB) {
    ordersB = (await accountStore.updateVenueOrders(accountB)) ?? [];
    rejectB = isVenueReject(ordersB);
  }

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
