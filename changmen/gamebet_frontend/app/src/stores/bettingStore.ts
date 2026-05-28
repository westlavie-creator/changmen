import { defineStore } from "pinia";
import { saveOrderBind } from "@/api/esport";
import { BetOption, opponentSide } from "@/models/betOption";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { createBetLinkId, type OrderBindRow } from "@/models/betResult";
import { LoseOrder } from "@/models/loseOrder";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOrderStore } from "@/stores/orderStore";
import { useUserStore } from "@/stores/userStore";
import { useMessageStore } from "@/stores/messageStore";
import { wait } from "@/shared/wait";

const BET_ACCOUNT_PREFIX = "BETACCOUNT:";

function readUsedAccounts(betRowId: number, side: string) {
  try {
    const raw = sessionStorage.getItem(`${BET_ACCOUNT_PREFIX}${betRowId}:${side}`);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function markUsedAccount(accountId: number, betRowId: number, side: string) {
  const key = `${BET_ACCOUNT_PREFIX}${betRowId}:${side}`;
  const list = readUsedAccounts(betRowId, side);
  if (!list.includes(accountId)) {
    list.push(accountId);
    sessionStorage.setItem(key, JSON.stringify(list));
  }
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

            const options = bet.getOrderOptions(match, config, providerKeys);
            if (!options || options.length !== 2) continue;

            let legA = options[0];
            let legB = options[1];
            const linkId = createBetLinkId();

            const accountA = accountStore.getAccount(
              legA.type,
              legA.betMoney,
              config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [],
              (acc) => {
                if (acc.isPause() || acc.markupOnly) return false;
                if (!acc.checkOdds(legA.odds, match.gameId)) return false;
                const target = matchStore.getBetTarget(acc.provider, bet.id);
                if (target && target !== legA.target) return false;
                return true;
              },
              options,
            );
            const accountB = accountStore.getAccount(
              legB.type,
              legB.betMoney,
              config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [],
              (acc) => {
                if (acc.isPause() || acc.markupOnly) return false;
                if (!acc.checkOdds(legB.odds, match.gameId)) return false;
                const target = matchStore.getBetTarget(acc.provider, bet.id);
                if (target && target !== legB.target) return false;
                return true;
              },
              options,
            );
            if (!accountA || !accountB) continue;

            accountA.active = accountB.active = true;
            const checkStart = Date.now();
            const checked = await Promise.all([
              accountStore.checkBetting(accountA, legA),
              accountStore.checkBetting(accountB, legB),
            ]);
            legA = checked[0];
            legB = checked[1];
            if (!legA.data || !legB.data) {
              await wait(1000);
              continue;
            }
            if (config.checkTimeout && Date.now() - checkStart > config.checkTimeout) {
              this.setMessage(`前置检查超时 ${Date.now() - checkStart}ms`);
              continue;
            }

            legA.orderIndex = 1;
            legB.orderIndex = 2;
            const waitSec = Math.max(
              config.waitTime[accountA.provider] ?? 0,
              config.waitTime[accountB.provider] ?? 0,
              10,
            );

            let resultA;
            let resultB;
            if (config.betSorting === "Parallel") {
              const pair = await Promise.all([
                accountStore.betting(accountA, legA, waitSec),
                accountStore.betting(accountB, legB, waitSec),
              ]);
              resultA = pair[0];
              resultB = pair[1];
            } else {
              resultA = await accountStore.betting(accountA, legA, waitSec);
              if (!resultA.success) continue;
              resultB = await accountStore.betting(accountB, legB, waitSec);
            }

            if (resultA?.success) {
              markUsedAccount(accountA.accountId, bet.id, legA.target);
              void accountStore.refreshBalance(accountA);
            }
            if (resultB?.success) {
              markUsedAccount(accountB.accountId, bet.id, legB.target);
              void accountStore.refreshBalance(accountB);
            }

            const binds: OrderBindRow[] = [];
            if (resultA?.success) {
              binds.push({ LinkID: linkId, Provider: resultA.provider, OrderID: String(linkId) });
            }
            if (resultB?.success) {
              binds.push({ LinkID: linkId, Provider: resultB.provider, OrderID: String(linkId + 1) });
            }
            if (binds.length) {
              await saveOrderBind({ orders: JSON.stringify(binds) });
            }

            if (resultA && resultB && (resultA.success || resultB.success)) {
              useMessageStore().bettingMessage(
                { account: accountA, result: resultA, options: legA },
                { account: accountB, result: resultB, options: legB },
              );
            }

            if (resultA?.success && !resultB?.success && config.makeUp) {
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
              this.setMessage(`${legB.type} 下单失败，已加入补单队列`);
            } else if (resultB?.success && !resultA?.success && config.makeUp) {
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
              this.setMessage(`${legA.type} 下单失败，已加入补单队列`);
            }

            if (resultA?.success || resultB?.success) {
              await wait(waitSec * 1000);
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
      const account = accountStore.getAccount(item.type, 0);
      if (!account) {
        window.alert(`没有找到 ${item.type} 对应的账号`);
        return;
      }
      const raw = window.prompt(
        "请输入要投注的金额",
        String(configStore.config.betMoney || 10),
      );
      if (!raw) return;
      const amount = Number(raw);
      if (!amount || amount <= 0) return;

      let option = new BetOption(match, bet, item, side, amount);
      option = await accountStore.checkBetting(account, option);
      if (!option.data) {
        window.alert(option.checkError || "前置检查失败");
        return;
      }
      const result = await accountStore.betting(account, option);
      if (result?.success) {
        this.setMessage(`手动下单成功 ${item.type}@${option.odds}`);
        void accountStore.refreshBalance(account);
        void orderStore.fetchOrders();
      } else {
        window.alert(result?.message || "下单失败");
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

          const waitSec =
            config.waitTime[account.provider] === -1
              ? 0
              : Math.max(config.waitTime[account.provider] ?? 0, 10);
          const result = await accountStore.betting(account, checked, waitSec);
          if (result?.success) {
            removeIds.push(betId);
            markUsedAccount(account.accountId, bet.id, order.target);
            void accountStore.refreshBalance(account);
            if (waitSec > 0) await wait(waitSec * 1000);
            await saveOrderBind({
              orders: JSON.stringify([
                { LinkID: order.linkId, Provider: result.provider, OrderID: String(Date.now()) },
              ]),
            });
            this.setMessage(`补单成功 ${item.type}@${checked.odds}`);
            useMessageStore().loseOrderMessage(account, order, checked, false);
          } else if (!result) {
            removeIds.push(betId);
          }
        }
      }

      for (const id of removeIds) {
        loseStore.removeOrder(id, true);
      }
    },
  },
});
