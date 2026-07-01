import type { UserConfig } from "@/types/userConfig";
import { defineStore } from "pinia";
import { toRaw } from "vue";
import { getClientData, saveClientDataDetailed } from "@/api/esport";
import {
  createDefaultUserConfig,
  mergeUserConfig,

} from "@/types/userConfig";

const CONFIG_KEY = "USERCONFIG";

export interface ConfigSaveResult {
  ok: boolean;
  msg?: string;
}

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

    buildSavePayload(): UserConfig {
      const raw = toRaw(this.config) as UserConfig & {
        arbDetectEngine?: unknown;
        arbExecuteEngine?: unknown;
      };
      const {
        arbDetectEngine: _legacyDetectEngine,
        arbExecuteEngine: _legacyExecuteEngine,
        ...configBody
      } = raw;
      return {
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
    },

    async save(): Promise<ConfigSaveResult> {
      this.saving = true;
      try {
        const payload = this.buildSavePayload();
        let content: string;
        try {
          content = JSON.stringify(payload);
        }
        catch {
          return { ok: false, msg: "配置无法序列化，请刷新页面后重试" };
        }
        const result = await saveClientDataDetailed(CONFIG_KEY, content);
        if (result.ok) {
          this.config = payload;
        }
        return result;
      }
      finally {
        this.saving = false;
      }
    },
  },
});
