import { defineStore } from "pinia";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";
import { runManualBet } from "@/stores/betting/manualBet";
import { processLoseOrders as runProcessLoseOrders } from "@/stores/betting/loseOrder";

/** 对齐 A8 自动投注：主循环在 matchStore（bundle `Vg.P()`）；本 store 保留手动下注与状态 */
export const useBettingStore = defineStore("betting", {
  state: () => ({
    lastMessage: "",
    lastAt: 0,
  }),

  actions: {
    /** @deprecated 主循环由 matchStore.startMainLoop 驱动；保留兼容旧调用 */
    start() {
      useMatchStore().startMainLoop();
    },

    /** @deprecated 见 matchStore.stopMainLoop */
    stop() {
      useMatchStore().stopMainLoop();
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
