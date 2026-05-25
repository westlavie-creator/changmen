import { BetResult } from "@/models/betResult";
import type { PlatformProvider } from "@/providers/types";

/** 对齐 A8 nJe — Stake 下注依赖浏览器插件 tabId，纯 Web 仅占位 */
export const stakeProvider: PlatformProvider = {
  async getBalance() {
    throw new Error("Stake 余额需 A8 浏览器插件");
  },

  async checkBet(_account, option) {
    option.checkError = "Stake 下注需 A8 浏览器插件（tabId）";
    return option;
  },

  async betting(account, option) {
    return new BetResult(account.provider, false, "Stake 下注需 A8 浏览器插件", option.data);
  },
};
