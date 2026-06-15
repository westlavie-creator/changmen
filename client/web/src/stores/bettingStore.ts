import { defineStore } from "pinia";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";
import { runAutoBetTick } from "@/stores/betting/autoBetLoop";
import { processLoseOrders as runProcessLoseOrders } from "@/stores/betting/loseOrder";
import { runManualBet } from "@/stores/betting/manualBet";
import { notifyArbOpportunitiesOnBettingTick } from "@/stores/betting/notifyArb";

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

      try {
        this.tickAutoOpen();
        if (!user.userId) return;

        await matchStore.fetchMatches();
        for (const match of matchStore.matchs) {
          for (const bet of match.bets) {
            bet.items.forEach((item) => item.updateOdds());
          }
        }

        notifyArbOpportunitiesOnBettingTick();

        if (!configStore.config.betting) return;

        await runAutoBetTick({
          setMessage: (m) => this.setMessage(m),
          processLoseOrders: () => this.processLoseOrders(),
        });
      } finally {
        for (const acc of accountStore.accounts) {
          if (acc.active) acc.active = false;
        }
        const interval = Math.max(useConfigStore().config.betInterval, 1) * 1000;
        this.scheduleNext(interval);
      }
    },

    async manualBet(match: ViewMatch, bet: ViewBet, item: ViewBetItem, side: BetSide) {
      await runManualBet(match, bet, item, side, {
        setMessage: (m) => this.setMessage(m),
      });
    },

    async processLoseOrders() {
      await runProcessLoseOrders({
        setMessage: (m) => this.setMessage(m),
      });
    },
  },
});
