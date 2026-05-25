import { defineStore } from "pinia";
import type { PlatformId } from "@/types/esport";
import type { LimitEntry } from "@/types/limit";

export interface OddsEntry {
  id: string;
  odds: number;
  isLock: boolean;
  betId?: string;
  time: number;
}

/** 对齐 A8 Pinia `fo` — 实时赔率缓存 */
export const useOddsStore = defineStore("odds", {
  state: () => ({
    /** platform → oddsId → entry */
    data: new Map<PlatformId, Map<string, OddsEntry>>(),
    /** platform → betId → oddsId[] */
    betIndex: new Map<PlatformId, Map<string, string[]>>(),
    /** platform → last WS payload (debug) */
    messages: new Map<PlatformId, string>(),
    /** platform → oddsId → limit */
    limits: new Map<PlatformId, Map<string, LimitEntry>>(),
    revision: 0,
  }),

  actions: {
    save(platform: PlatformId, entry: OddsEntry) {
      if (!this.data.has(platform)) this.data.set(platform, new Map());
      const bucket = this.data.get(platform)!;
      bucket.set(entry.id, entry);
      this.revision += 1;

      if (entry.betId) {
        if (!this.betIndex.has(platform)) this.betIndex.set(platform, new Map());
        const idx = this.betIndex.get(platform)!;
        const list = idx.get(entry.betId) ?? [];
        if (!list.includes(entry.id)) {
          list.push(entry.id);
          idx.set(entry.betId, list);
        }
      }
    },

    isOdds(platform: PlatformId, oddsId: string): boolean {
      return Boolean(this.data.get(platform)?.has(oddsId));
    },

    getOdds(platform: PlatformId, oddsId: string, fallback = 0): number {
      const row = this.data.get(platform)?.get(oddsId);
      if (!row) return fallback;
      if (row.isLock) return 0;
      return row.odds || fallback;
    },

    updateOddsLock(platform: PlatformId, oddsId: string, locked: boolean) {
      const row = this.data.get(platform)?.get(oddsId);
      if (row) {
        row.isLock = locked;
        this.revision += 1;
      }
    },

    updateBetLock(platform: PlatformId, betId: string, locked: boolean) {
      const ids = this.betIndex.get(platform)?.get(betId);
      if (!ids) return;
      for (const id of ids) this.updateOddsLock(platform, id, locked);
    },

    updateMessage(platform: PlatformId, payload: string) {
      this.messages.set(platform, payload);
    },

    clean(platform?: PlatformId) {
      if (platform) {
        this.data.set(platform, new Map());
        this.betIndex.set(platform, new Map());
        return;
      }
      const cutoff = Date.now() - 3_600_000;
      for (const bucket of this.data.values()) {
        for (const [id, row] of [...bucket.entries()]) {
          if (row.time < cutoff) bucket.delete(id);
        }
      }
    },

    hasLimit(platform: PlatformId, ids: string[]): boolean {
      this.cleanExpiredLimits();
      const bucket = this.limits.get(platform);
      if (!bucket) return false;
      const now = Date.now();
      return ids.some((id) => {
        const row = bucket.get(id);
        return Boolean(row && (!row.expireTime || row.expireTime >= now));
      });
    },

    getLimit(platform: PlatformId, oddsId: string): LimitEntry | undefined {
      this.cleanExpiredLimits();
      const row = this.limits.get(platform)?.get(oddsId);
      if (!row) return undefined;
      if (row.expireTime && row.expireTime < Date.now()) return undefined;
      return row;
    },

    setLimit(
      platform: PlatformId,
      oddsId: string,
      value: number,
      payout?: number,
      ttlSec?: number,
    ) {
      if (!this.limits.has(platform)) this.limits.set(platform, new Map());
      const expireTime = ttlSec ? Date.now() + ttlSec * 1000 : undefined;
      const entry: LimitEntry = { value, expireTime };
      if (payout) entry.payout = payout;
      this.limits.get(platform)!.set(oddsId, entry);
      this.revision += 1;
    },

    deleteLimit(platform: PlatformId, oddsId: string) {
      this.limits.get(platform)?.delete(oddsId);
      this.revision += 1;
    },

    cleanExpiredLimits(platform?: PlatformId) {
      const now = Date.now();
      const buckets = platform
        ? [[platform, this.limits.get(platform)] as const]
        : [...this.limits.entries()];
      for (const [, bucket] of buckets) {
        if (!bucket) continue;
        for (const [id, row] of [...bucket.entries()]) {
          if (row.expireTime && row.expireTime < now) bucket.delete(id);
        }
      }
    },
  },
});
