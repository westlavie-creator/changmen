import { saveOrderBind } from "@/api/esport";
import { getDefaultOdds } from "@/api/report";
import { BetOption, opponentSide } from "@/models/betOption";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult, createBetLinkId, type OrderBindRow } from "@/models/betResult";
import { LoseOrder } from "@/models/loseOrder";
import type { UserConfig } from "@/types/userConfig";
import type { PlatformId } from "@/types/esport";
import type { VenueOrder } from "@platform/contract";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOrderStore } from "@/stores/orderStore";
import { useMessageStore } from "@/stores/messageStore";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";
import { betToastSeconds, passesMaxBetCount } from "@/shared/bettingSession";
import {
  accountPassesMainBetFilter,
  passesDefaultOddsAccount,
} from "@/stores/betting/betFilters";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/betSession";

export interface AutoBetTickContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

function rejectWaitSeconds(config: UserConfig, accounts: PlatformAccount[]): number {
  if (!accounts.length) return 0;
  return Math.max(...accounts.map((a) => config.waitTime[a.provider] ?? 5));
}

export function isVenueReject(orders: VenueOrder[]): boolean {
  return orders.length > 0 && orders[0].status === "reject";
}

/** 对齐 bundle `S()`：补单前初赔 / 当前赔阈值 */
async function allowMakeUpForLeg(
  match: ViewMatch,
  bet: ViewBet,
  target: BetSide,
  currentOdds: number,
  config: UserConfig,
  setMessage: (msg: string) => void,
): Promise<boolean> {
  let denyReason: string | undefined;
  if (config.makeUp_defaultOdds !== 0) {
    const def = await getDefaultOdds({
      matchId: match.id,
      betId: bet.id,
      team: target,
    });
    if (def !== 0 && config.makeUp_defaultOdds <= def) {
      denyReason = `初赔赔率:${def}，大于当前设定值：${config.makeUp_defaultOdds}`;
    }
  }
  if (!denyReason && config.makeUp_odds !== 0 && config.makeUp_odds <= currentOdds) {
    denyReason = `当前赔率:${currentOdds}，大于当前设定值：${config.makeUp_odds}`;
  }
  if (denyReason) {
    setMessage(`不予补单：${denyReason}`);
    a8Tip("不予补单提醒", denyReason, 3000);
    return false;
  }
  return true;
}

async function waitRejectDetection(countdownSec: number, actualWaitSec: number) {
  if (actualWaitSec <= 0) return;
  a8Tip("拒单检测", `等待<countdown>${countdownSec}</countdown>秒`, countdownSec * 1000);
  for (let i = 0; i < actualWaitSec; i++) {
    await wait(1000);
  }
}

/**
 * 对齐 bundle：一侧成功、一侧失败时换平台重试失败腿（最多 3 轮）。
 * anyOdds 仅影响最低赔阈值（makeProfit vs anyOddsProfit）。
 */
async function retryFailedLeg(
  match: ViewMatch,
  bet: ViewBet,
  successLeg: BetOption,
  failedLeg: BetOption,
  config: UserConfig,
  waitSec: number,
): Promise<{ leg: BetOption; account: PlatformAccount; result: BetResult } | null> {
  const accountStore = useAccountStore();
  const matchStore = useMatchStore();
  const profitThreshold = config.anyOdds ? config.anyOddsProfit : config.makeProfit;
  const minOdds = 1 / (1 / profitThreshold - 1 / successLeg.odds);

  const tried: PlatformId[] = [];

  for (let round = 0; round < 3; round++) {
    bet.items.forEach((item) => item.updateOdds());

    const candidates = bet.items
      .filter(
        (item) =>
          !tried.includes(item.type) &&
          item.getOdds(failedLeg.target) >= minOdds,
      )
      .sort(
        (a, b) => b.getOdds(failedLeg.target) - a.getOdds(failedLeg.target),
      );

    if (!candidates.length) break;

    let pickedAccount: PlatformAccount | undefined;
    let pickedItem: ViewBetItem | undefined;
    let stake = 0;
    let odds = 0;

    for (const item of candidates) {
      odds = item.getOdds(failedLeg.target);
      stake = Math.floor((successLeg.odds * successLeg.betMoney) / odds);
      const acc = accountStore.getAccount(
        item.type,
        stake,
        config.noSameBet
          ? readUsedAccounts(bet.id, opponentSide(failedLeg.target))
          : [],
        (u) => {
          if (u.isPause() || tried.includes(u.provider)) return false;
          if (!u.checkOdds(odds, match.gameId)) return false;
          const retryImplied = 1 / (1 / successLeg.odds + 1 / odds);
          if (!u.passesGameSettings(match.game, odds, retryImplied)) return false;
          if (!passesDefaultOddsAccount(u, bet.id, failedLeg.target)) return false;
          if (!passesMaxBetCount(u, bet.id, failedLeg.target)) return false;
          const target = matchStore.getBetTarget(u.provider, bet.id);
          if (target && target !== failedLeg.target) return false;
          return true;
        },
      );
      if (acc) {
        pickedAccount = acc;
        pickedItem = item;
        break;
      }
    }

    if (!pickedAccount || !pickedItem) break;

    tried.push(pickedAccount.provider);
    let retryLeg = new BetOption(match, bet, pickedItem, failedLeg.target, stake);
    retryLeg = await accountStore.checkBetting(pickedAccount, retryLeg);
    if (!retryLeg.data) continue;

    const result = await accountStore.betting(pickedAccount, retryLeg, waitSec);
    if (result?.success) {
      return { leg: retryLeg, account: pickedAccount, result };
    }
  }

  return null;
}

/** [A8 可证实] 自动投注主循环体（Vg + Io + jb）；config.betting 为 true 时由 runTick 调用 */
export async function runAutoBetTick(ctx: AutoBetTickContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const orderStore = useOrderStore();
  const { setMessage, processLoseOrders } = ctx;

  loseStore.ensureOrdersMap();
  loseStore.removeOrders(matchStore.matchs.flatMap((m) => m.bets.map((b) => b.id)));

  const config = configStore.config;
  if (config.minMoney && config.maxMoney) {
    config.betMoney =
      Math.floor(Math.random() * (config.maxMoney - config.minMoney + 1)) + config.minMoney;
  }

  const providerKeys = [...accountStore.getProviders().keys()];
  if (!providerKeys.length) return;

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      if (loseStore.orders.has(bet.id)) continue;

      const options = bet.getOrderOptions(
        match,
        config,
        providerKeys,
        accountStore.accounts,
      );
      if (!options || options.length !== 2) continue;

      let legA = options[0];
      let legB = options[1];
      const implied =
        1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);

      let accountA = accountStore.getAccount(
        legA.type,
        legA.betMoney,
        config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [],
        (acc) =>
          accountPassesMainBetFilter(acc, bet, match, legA, matchStore, implied),
        options,
      );
      let accountB = accountStore.getAccount(
        legB.type,
        legB.betMoney,
        config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [],
        (acc) =>
          accountPassesMainBetFilter(acc, bet, match, legB, matchStore, implied),
        options,
      );
      if (!accountA && !accountB) continue;

      const betBothLegs = Boolean(accountA) && Boolean(accountB);
      const linkId = createBetLinkId(!betBothLegs);
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
        await wait(1000);
        continue;
      }
      if (config.checkTimeout && Date.now() - checkStart > config.checkTimeout) {
        const elapsed = Date.now() - checkStart;
        const msg = `超时时间：${elapsed}ms，大于设定值：${config.checkTimeout}ms`;
        setMessage(`前置检查超时 ${elapsed}ms`);
        a8Tip("前置检查超时", msg, 3000);
        continue;
      }

      if (accountA) legA.orderIndex = 1;
      if (accountB) legB.orderIndex = betBothLegs ? 2 : 1;
      const waitSec = Math.max(
        accountA ? betToastSeconds(config, accountA.provider) : 0,
        accountB ? betToastSeconds(config, accountB.provider) : 0,
      );

      let resultA: BetResult | undefined;
      let resultB: BetResult | undefined;
      if (!betBothLegs) {
        if (accountA) {
          resultA = await accountStore.betting(accountA, legA, waitSec);
          if (!resultA?.success) continue;
        } else {
          resultB = await accountStore.betting(accountB!, legB, waitSec);
          if (!resultB?.success) continue;
        }
      } else if (config.betSorting === "Parallel") {
        const pair = await Promise.all([
          accountStore.betting(accountA, legA, waitSec),
          accountStore.betting(accountB, legB, waitSec),
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
        if (!resultA?.success) continue;
      } else {
        resultA = await accountStore.betting(accountA!, legA, waitSec);
        if (!resultA.success) continue;
        resultB = await accountStore.betting(accountB!, legB, waitSec);
      }

      if (betBothLegs && resultA?.success && !resultB?.success) {
        const retry = await retryFailedLeg(
          match,
          bet,
          legA,
          legB,
          config,
          waitSec,
        );
        if (retry) {
          resultB = retry.result;
          legB = retry.leg;
          accountB = retry.account;
        }
      } else if (betBothLegs && resultB?.success && !resultA?.success) {
        const retry = await retryFailedLeg(
          match,
          bet,
          legB,
          legA,
          config,
          waitSec,
        );
        if (retry) {
          resultA = retry.result;
          legA = retry.leg;
          accountA = retry.account;
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
        ordersA = await accountStore.updateVenueOrders(accountA);
        rejectA = isVenueReject(ordersA);
      }
      if (resultB?.success && accountB) {
        ordersB = await accountStore.updateVenueOrders(accountB);
        rejectB = isVenueReject(ordersB);
      }

      const binds: OrderBindRow[] = [];
      if (resultA?.success && accountA && ordersA.length) {
        binds.push({
          LinkID: linkId,
          Provider: resultA.provider,
          OrderID: ordersA[0].orderId,
          PlayerID: accountA.accountId,
        });
      }
      if (resultB?.success && accountB && ordersB.length) {
        binds.push({
          LinkID: linkId,
          Provider: resultB.provider,
          OrderID: ordersB[0].orderId,
          PlayerID: accountB.accountId,
        });
      }
      if (binds.length) {
        await saveOrderBind({ orders: JSON.stringify(binds) });
      }

      if (
        betBothLegs &&
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
        const okMakeUp = await allowMakeUpForLeg(
          match,
          bet,
          legB.target,
          legB.odds,
          config,
          setMessage,
        );
        if (okMakeUp) {
          loseStore.createOrder(
            new LoseOrder({
              accountId: accountA.accountId,
              matchId: match.id,
              betId: bet.id,
              target: legB.target,
              betMoney: legA.betMoney,
              betOdds: legA.odds,
              match: match.title,
              bet: bet.getBetName(),
              linkId,
              createAt: Date.now(),
              isCreateOrder: false,
              betCount: 1,
            }),
          );
          await wait(500);
          setMessage(`${legB.type} 下单失败，已加入补单队列`);
          a8Tip("补单提醒", `${legB.type} 下单失败，创建补单队列`, 3000);
        }
      } else if (
        betBothLegs &&
        accountB &&
        resultB?.success &&
        !rejectB &&
        (!resultA?.success || rejectA) &&
        config.makeUp
      ) {
        const okMakeUp = await allowMakeUpForLeg(
          match,
          bet,
          legA.target,
          legA.odds,
          config,
          setMessage,
        );
        if (okMakeUp) {
          loseStore.createOrder(
            new LoseOrder({
              accountId: accountB.accountId,
              matchId: match.id,
              betId: bet.id,
              target: legA.target,
              betMoney: legB.betMoney,
              betOdds: legB.odds,
              match: match.title,
              bet: bet.getBetName(),
              linkId,
              createAt: Date.now(),
              isCreateOrder: false,
              betCount: 1,
            }),
          );
          await wait(500);
          setMessage(`${legA.type} 下单失败，已加入补单队列`);
          a8Tip("补单提醒", `${legA.type} 下单失败，创建补单队列`, 3000);
        }
      }

      if (resultA?.success && !rejectA && accountA) {
        markSuccessfulBet(accountA, bet.id, legA.target, legA.odds, match.game);
      }
      if (resultB?.success && !rejectB && accountB) {
        markSuccessfulBet(accountB, bet.id, legB.target, legB.odds, match.game);
      }

      if (resultA?.success || resultB?.success) {
        await orderStore.fetchOrders();
      }
    }
  }

  if (loseStore.orders.size && config.makeUp) {
    await processLoseOrders();
  }
}
