import type { ViewBet, ViewMatch } from "@/models/match";
import { defineStore } from "pinia";

/** [A8 可证实] HomeView 单例 CreateLoseView：h/g/y + v(match,bet) 打开 */
export const useCreateLoseDialogStore = defineStore("createLoseDialog", {
  state: () => ({
    open: false as boolean,
    match: undefined as ViewMatch | undefined,
    bet: undefined as ViewBet | undefined,
  }),

  actions: {
    show(match: ViewMatch, bet: ViewBet) {
      this.match = match;
      this.bet = bet;
      this.open = true;
    },

    close() {
      this.open = false;
      this.match = undefined;
      this.bet = undefined;
    },
  },
});
