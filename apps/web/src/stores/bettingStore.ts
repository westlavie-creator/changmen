import { defineStore } from "pinia";
import { ElMessageBox } from "element-plus";
import { saveOrderBind } from "@/api/esport";
import { getDefaultOdds } from "@/api/report";
import { BetOption, opponentSide } from "@/models/betOption";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult, createBetLinkId, type OrderBindRow } from "@/models/betResult";
import { LoseOrder } from "@/models/loseOrder";
import type { UserConfig } from "@/types/userConfig";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOrderStore } from "@/stores/orderStore";
import { useUserStore } from "@/stores/userStore";
import { useMessageStore } from "@/stores/messageStore";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";
import {
  betToastSeconds,
  incrementBetCount,
  incrementGameBetCount,
  passesLastOddsGate,
  passesMaxBetCount,
  setLastBetOdds,
} from "@/shared/bettingSession";
import type { PlatformId } from "@/types/esport";
import type { VenueOrder } from "@platform/contract";

const BET_ACCOUNT_PREFIX = "BETACCOUNT:";

function readUsedAccounts(betRowId: number, side: string) {
  try {
    const raw = sessionStorage.getItem(`${BET_ACCOUNT_PREFIX}${betRowId}:${side}`);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function markUsedAccount(accountId: number, betRowId: number, side: BetSide) {
  const key = `${BET_ACCOUNT_PREFIX}${betRowId}:${side}`;
  const list = readUsedAccounts(betRowId, side);
  if (!list.includes(accountId)) {
    list.push(accountId);
    sessionStorage.setItem(key, JSON.stringify(list));
  }
}

/** 对齐 bundle `_()`：成功且未拒单后标记账号与下注计数 */
function markSuccessfulBet(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
  odds: number,
  gameName?: string,
) {
  markUsedAccount(account.accountId, betId, side);
  incrementBetCount(account.accountId, betId, side);
  setLastBetOdds(account.accountId, betId, side, odds);
  if (gameName) incrementGameBetCount(account.accountId, gameName);
}

function rejectWaitSeconds(
  config: UserConfig,
  accounts: PlatformAccount[],
): number {
  if (!accounts.length) return 0;
  return Math.max(...accounts.map((a) => config.waitTime[a.provider] ?? 5));
}

function isVenueReject(orders: VenueOrder[]): boolean {
  return orders.length > 0 && orders[0].status === "reject";
}

/** 对齐 bundle：账号 minDefault / maxDefault 与初赔比较 */
function passesDefaultOddsAccount(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
): boolean {
  const def = useMatchStore().getDefaultOdds(betId, side);
  if (!def) return true;
  if (account.minDefault && def < account.minDefault) return false;
  if (account.maxDefault && def > account.maxDefault) return false;
  return true;
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

function accountPassesMainBetFilter(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: ReturnType<typeof useMatchStore>,
  implied?: number,
): boolean {
  if (account.isPause() || account.markupOnly) return false;
  if (!account.checkOdds(leg.odds, match.gameId)) return false;
  if (!account.passesGameSettings(match.game, leg.odds, implied)) return false;
  if (!passesDefaultOddsAccount(account, bet.id, leg.target)) return false;
  if (!passesLastOddsGate(account, bet.id, leg.target, leg.odds)) return false;
  if (!passesMaxBetCount(account, bet.id, leg.target)) return false;
  if (!account.canBetAtOdds(leg.odds)) return false;
  const target = matchStore.getBetTarget(account.provider, bet.id);
  if (target && target !== leg.target) return false;
  return true;
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

/** 对齐 A8 自动投注主循环（Vg + Io + jb） */
export const useBettingStore = defineStore("betting", {
  state: () => ({
    running: false,
    loopTimer: null as ReturnType<typeof setTimeout> | null,
    lastMessage: "",
    lastAt: 0,
  }),

  actions: {
    start() {
      if (this.running) return;
      this.running = true;
      void this.scheduleNext(0);
    },

    stop() {
      this.running = false;
      if (this.loopTimer) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
    },

    scheduleNext(delayMs: number) {
      if (!this.running) return;
      if (this.loopTimer) clearTimeout(this.loopTimer);
      this.loopTimer = setTimeout(() => {
        void this.runTick();
      }, delayMs);
    },

    setMessage(msg: string) {
      this.lastMessage = msg;
      this.lastAt = Date.now();
    },

    tickAutoOpen() {
      const configStore = useConfigStore();
      const cfg = configStore.config;
      if (cfg.bettingAutoOpen && !cfg.betting && cfg.bettingAutoOpenTime) {
        if (Date.now() >= cfg.bettingAutoOpenTime) {
          cfg.betting = true;
          cfg.bettingAutoOpen = false;
          cfg.bettingAutoOpenTime = 0;
          void configStore.save();
        }
      }
    },

    async runTick() {
      const user = useUserStore();
      const configStore = useConfigStore();
      const matchStore = useMatchStore();
      const accountStore = useAccountStore();
      const loseStore = useLoseOrderStore();
      const orderStore = useOrderStore();

      try {
        this.tickAutoOpen();
        if (!user.userId) return;

        await matchStore.fetchMatches();
        for (const match of matchStore.matchs) {
          for (const bet of match.bets) {
            bet.items.forEach((item) => item.updateOdds());
          }
        }

        if (!configStore.config.betting) return;

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
            const linkId = createBetLinkId();
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
              this.setMessage(`前置检查超时 ${elapsed}ms`);
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
            if (resultA?.success) {
              successAccounts.push(accountA);
              void accountStore.refreshBalance(accountA);
            }
            if (resultB?.success) {
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
            if (resultA?.success) {
              ordersA = await accountStore.updateVenueOrders(accountA);
              rejectA = isVenueReject(ordersA);
            }
            if (resultB?.success) {
              ordersB = await accountStore.updateVenueOrders(accountB);
              rejectB = isVenueReject(ordersB);
            }

            const binds: OrderBindRow[] = [];
            if (resultA?.success && ordersA.length) {
              binds.push({
                LinkID: linkId,
                Provider: resultA.provider,
                OrderID: ordersA[0].orderId,
                PlayerID: accountA.accountId,
              });
            }
            if (resultB?.success && ordersB.length) {
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

            if (resultA && resultB && (resultA.success || resultB.success)) {
              useMessageStore().bettingMessage(
                { account: accountA!, result: resultA, options: legA, reject: rejectA },
                { account: accountB!, result: resultB, options: legB, reject: rejectB },
              );
            }

            if (
              betBothLegs &&
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
                (m) => this.setMessage(m),
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
                this.setMessage(`${legB.type} 下单失败，已加入补单队列`);
                a8Tip("补单提醒", `${legB.type} 下单失败，创建补单队列`, 3000);
              }
            } else if (
              betBothLegs &&
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
                (m) => this.setMessage(m),
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
                this.setMessage(`${legA.type} 下单失败，已加入补单队列`);
                a8Tip("补单提醒", `${legA.type} 下单失败，创建补单队列`, 3000);
              }
            }

            if (resultA?.success && !rejectA) {
              markSuccessfulBet(accountA, bet.id, legA.target, legA.odds, match.game);
            }
            if (resultB?.success && !rejectB) {
              markSuccessfulBet(accountB, bet.id, legB.target, legB.odds, match.game);
            }

            if (resultA?.success || resultB?.success) {
              await orderStore.fetchOrders();
            }
          }
        }

        if (loseStore.orders.size && config.makeUp) {
          await this.processLoseOrders();
        }
      } finally {
        for (const acc of accountStore.accounts) {
          if (acc.active) acc.active = false;
        }
        const interval = Math.max(useConfigStore().config.betInterval, 1) * 1000;
        this.scheduleNext(interval);
      }
    },

    async manualBet(match: ViewMatch, bet: ViewBet, item: ViewBetItem, side: BetSide) {
      const accountStore = useAccountStore();
      const orderStore = useOrderStore();
      const configStore = useConfigStore();
      const matchStore = useMatchStore();

      // [A8 可证实] 双击赔率：先 getAccount(type, 0)，无账号再提示；有账号才 prompt 金额
      const account = accountStore.getAccount(item.type, 0);
      if (!account) {
        await ElMessageBox.alert("没有找到对应的账号", String(item.type));
        return;
      }

      let amount: number;
      try {
        const { value } = await ElMessageBox.prompt("请输入要投注的金额", "手动下单", {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          inputValue: String(configStore.config.betMoney || 10),
          inputType: "number",
          inputValidator: (val) => (Number(val) > 0 ? true : "请输入有效金额"),
        });
        amount = Number(value);
        if (!amount || amount <= 0) return;
      } catch {
        return;
      }

      const odds = item.getOdds(side);
      let option = new BetOption(match, bet, item, side, amount);
      option.odds = odds;
      if (!accountPassesMainBetFilter(account, bet, match, option, matchStore)) {
        await ElMessageBox.alert(`当前 ${item.type} 账号不满足投注条件`, "提示");
        return;
      }
      const bal = account.getBalance();
      if (bal !== undefined && bal < amount) {
        await ElMessageBox.alert(`余额不足（${bal} < ${amount}）`, String(item.type));
        return;
      }
      const toastSec = betToastSeconds(configStore.config, account.provider);
      option = await accountStore.checkBetting(account, option);
      if (!option.data) {
        ElMessageBox.alert(option.checkError || "前置检查失败", "前置检查失败");
        return;
      }
      const result = await accountStore.betting(account, option, toastSec);
      if (result?.success) {
        markSuccessfulBet(account, bet.id, side, option.odds, match.game);
        this.setMessage(`手动下单成功 ${item.type}@${option.odds}`);
        void accountStore.refreshBalance(account);
        void orderStore.fetchOrders();
      } else {
        ElMessageBox.alert(result?.message || "下单失败", "下单失败");
      }
    },

    async processLoseOrders() {
      const configStore = useConfigStore();
      const matchStore = useMatchStore();
      const accountStore = useAccountStore();
      const loseStore = useLoseOrderStore();
      const config = configStore.config;
      const removeIds: number[] = [];

      for (const [betId, order] of loseStore.orders) {
        const match = matchStore.matchs.find((m) => m.id === order.matchId);
        if (!match) {
          removeIds.push(betId);
          continue;
        }
        const bet = match.bets.find((b) => b.id === order.betId);
        if (!bet) {
          removeIds.push(betId);
          continue;
        }

        bet.items.forEach((item) => item.updateOdds());
        const minOdds = order.getOdds(config.makeProfit);
        const candidates = bet.items
          .filter((item) => item.getOdds(order.target) >= minOdds)
          .sort((a, b) => b.getOdds(order.target) - a.getOdds(order.target));

        for (const item of candidates) {
          if (removeIds.includes(betId)) break;
          const stake = order.getBetMoney(item.getOdds(order.target));
          const account = accountStore.getAccount(
            item.type,
            stake,
            config.noSameProvider ? readUsedAccounts(bet.id, opponentSide(order.target)) : [],
            (acc) => {
              if (acc.isPause() || acc.noMarkup) return false;
              const odds = item.getOdds(order.target);
              if (acc.minOdds && odds < acc.minOdds) return false;
              if (acc.maxOdds && odds > acc.maxOdds) return false;
              if (!acc.passesGameSettings(match.game, odds)) return false;
              if (!passesDefaultOddsAccount(acc, bet.id, order.target)) return false;
              if (!passesMaxBetCount(acc, bet.id, order.target)) return false;
              return true;
            },
          );
          if (!account) continue;

          const option = new BetOption(
            item.type,
            item.matchId,
            item.betId,
            item.getItemId(order.target),
            stake,
            order.target,
            item.getOdds(order.target),
          );
          option.loseOrder = true;
          option.match = match;
          option.bet = bet;
          option.item = item;

          const checked = await accountStore.checkBetting(account, option);
          if (!checked.data) continue;

          const waitSec = betToastSeconds(config, account.provider);
          const result = await accountStore.betting(account, checked, waitSec);
          if (!result?.success) {
            if (!result) removeIds.push(betId);
            continue;
          }

          void accountStore.refreshBalance(account);

          if (order.isCreateOrder) {
            removeIds.push(betId);
            markSuccessfulBet(account, bet.id, order.target, checked.odds, match.game);
            this.setMessage(`补单成功 ${item.type}@${checked.odds}`);
            useMessageStore().loseOrderMessage(account, order, checked, false);
            continue;
          }

          // 对齐 A8 补单：waitSec>0 才拒单复检；被拒不移出队列、仍绑单；API 成功即 markSuccessfulBet
          if (waitSec > 0) {
            a8Tip("拒单检测", `等待<countdown>${waitSec}</countdown>秒`, waitSec * 1000);
            await wait(waitSec * 1000);

            const venueOrders = await accountStore.updateVenueOrders(account);
            let rejected = false;
            if (venueOrders.length > 0) {
              rejected = isVenueReject(venueOrders);
              if (rejected) {
                this.setMessage(`${order.target} 再次被拒单`);
                a8Tip("拒单提醒", `${order.target} 再次被拒单`, 3000);
              } else {
                removeIds.push(betId);
                this.setMessage(`补单成功 ${item.type}@${checked.odds}`);
              }
              await saveOrderBind({
                orders: JSON.stringify([
                  {
                    LinkID: order.linkId,
                    Provider: result.provider,
                    OrderID: venueOrders[0].orderId,
                    PlayerID: account.accountId,
                  },
                ]),
              });
            } else {
              removeIds.push(betId);
            }
            useMessageStore().loseOrderMessage(account, order, checked, rejected);
          } else {
            removeIds.push(betId);
          }

          markSuccessfulBet(account, bet.id, order.target, checked.odds, match.game);
        }
      }

      for (const id of removeIds) {
        loseStore.removeOrder(id, true);
      }
    },
  },
});
