import type { PlatformId } from "@/types/esport";
import { defineStore } from "pinia";

/**
 * [changmen 扩展] 体育板实时赔率缓存。
 * 禁止与电竞 oddsStore(fo) 互通：不调用 saveVenueOdds / oddsStore.save。
 */
export const useSportOddsStore = defineStore("sportOdds", {
  state: () => ({
    /** platform → subscribeId（PM asset / PF marketId）→ 欧赔 */
    byVenue: {} as Record<string, Record<string, number>>,
    /** 触发 BetRow 重算（fallback 同值时仍可 bump） */
    tick: 0,
  }),
  actions: {
    save(platform: PlatformId | string, subscribeId: string, decimalOdds: number) {
      const p = String(platform);
      const id = String(subscribeId || "").trim();
      if (!p || !id)
        return;
      if (!Number.isFinite(decimalOdds) || decimalOdds <= 0)
        return;
      if (!this.byVenue[p])
        this.byVenue[p] = {};
      if (this.byVenue[p][id] === decimalOdds)
        return;
      this.byVenue[p][id] = decimalOdds;
      this.tick += 1;
    },
    get(platform: PlatformId | string, subscribeId: string): number {
      const row = this.byVenue[String(platform)];
      if (!row)
        return 0;
      return Number(row[String(subscribeId)]) || 0;
    },
    clear() {
      this.byVenue = {};
      this.tick += 1;
    },
  },
});
