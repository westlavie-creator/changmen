import { defineStore } from "pinia";
import { getClientData, saveClientData } from "@/api/esport";
import {
  createDefaultUserConfig,
  mergeUserConfig,
  type UserConfig,
} from "@/types/userConfig";

const CONFIG_KEY = "USERCONFIG";

/** 对齐 A8 `Xn.config`（USERCONFIG KV） */
export const useConfigStore = defineStore("config", {
  state: () => ({
    config: createDefaultUserConfig(),
    loaded: false,
    saving: false,
  }),

  actions: {
    async load() {
      const raw = await getClientData<Partial<UserConfig>>(CONFIG_KEY);
      this.config = mergeUserConfig(raw ?? undefined);
      this.loaded = true;
    },

    async save() {
      this.saving = true;
      try {
        const { arbExecuteEngine: _legacyExecuteEngine, ...configBody } = this.config;
        const payload: UserConfig = {
          ...configBody,
          betMoney: Number(this.config.betMoney) || 100,
          minMoney: Number(this.config.minMoney) || 0,
          maxMoney: Number(this.config.maxMoney) || 0,
          profit: Number(this.config.profit) || 1.03,
          maxProfit: Number(this.config.maxProfit) || 1.2,
          minOdds: Number(this.config.minOdds) || 1.3,
          maxOdds: Number(this.config.maxOdds) || 10,
          makeProfit: Number(this.config.makeProfit) || 1.01,
          makeUp_odds: Number(this.config.makeUp_odds) || 0,
          makeUp_defaultOdds: Number(this.config.makeUp_defaultOdds) || 0,
          anyOddsProfit: Number(this.config.anyOddsProfit) || 0.95,
          checkTimeout: Number(this.config.checkTimeout) || 3000,
        };
        const ok = await saveClientData(CONFIG_KEY, JSON.stringify(payload));
        if (ok) {
          this.config = payload;
        }
        return ok;
      } finally {
        this.saving = false;
      }
    },
  },
});
