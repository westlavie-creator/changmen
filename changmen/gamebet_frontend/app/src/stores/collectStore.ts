import { defineStore } from "pinia";
import { getClientData, saveClientData, saveBets, saveMatch, saveUserLog } from "@/api/esport";
import type { CollectBetDto, CollectConfigDto, CollectMatchDto } from "@/types/collect";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";

const CONFIG_KEY = "CollectConfig";

/** 对齐 A8 Pinia `Tf` — 采集开关 + SaveMatch/SaveBet 网关 */
export const useCollectStore = defineStore("collect", {
  state: () => ({
    log: false,
    collect: new Map<PlatformId, boolean>(),
    ready: false,
  }),

  getters: {
    isEnabled: (s) => (platform: PlatformId) => Boolean(s.collect.get(platform)),
  },

  actions: {
    async init() {
      const raw = await getClientData<CollectConfigDto>(CONFIG_KEY);
      const merged = new Map<PlatformId, boolean>();
      for (const id of ALL_PLATFORMS) {
        merged.set(id, false);
      }
      if (raw?.collect) {
        for (const [id, on] of raw.collect as [PlatformId, boolean][]) {
          merged.set(id, Boolean(on));
        }
      } else {
        // 保持 changmen 现网行为：首次进入默认开启核心上报链路
        // （否则会让 OB/RAY 轮询/入库链路全部静默）。
        merged.set("OB", true);
        merged.set("RAY", true);
      }
      this.collect = merged;
      this.log = Boolean(raw?.log);
      this.ready = true;
    },

    async saveConfig(patch: Partial<{ log: boolean; collect: Map<PlatformId, boolean> }>) {
      if (patch.log !== undefined) this.log = patch.log;
      if (patch.collect) this.collect = patch.collect;
      const payload: CollectConfigDto = {
        log: this.log,
        collect: [...this.collect.entries()],
      };
      await saveClientData(CONFIG_KEY, JSON.stringify(payload));
    },

    async saveMatch(platform: PlatformId, matchs: CollectMatchDto[]): Promise<boolean> {
      if (!this.collect.get(platform)) return false;
      if (!matchs.length) return false;
      const ok = await saveMatch(platform, matchs);
      await this.logCollect(`${platform}赛事采集${matchs.length}场 => ${ok}`, matchs);
      return ok;
    },

    async saveBets(
      platform: PlatformId,
      matchId: string | number,
      bets: CollectBetDto[],
    ): Promise<boolean> {
      if (!this.collect.get(platform)) return false;
      const ok = await saveBets(platform, matchId, bets);
      await this.logCollect(`${platform}盘口采集${matchId}/${bets.length} => ${ok}`, bets);
      return ok;
    },

    async logCollect(title: string, rows: unknown[]) {
      if (!this.log) return;
      await saveUserLog({ title, rows });
    },
  },
});
