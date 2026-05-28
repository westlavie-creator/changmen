import { defineStore } from "pinia";
import type { PlatformId } from "@/types/esport";
import type { LimitEntry } from "@/types/limit";
import { formatDisplayOdds } from "@/shared/format";

export type OddsSaveSource = "mqtt" | "http";

export interface OddsEntry {
  id: string;
  odds: number;
  isLock: boolean;
  betId?: string;
  /** OB game/view：@T1 / @T2，用于 Sources.HomeID 过期时按盘口找回赔率 */
  side?: "home" | "away";
  time: number;
  source?: OddsSaveSource;
}

export type OddsFlashDir = "up" | "down";

/** 赔率涨跌高亮保持时长（与 BetRow 颜色 transition 配合） */
const ODDS_FLASH_MS = 4_000;
const OB_MARKET_OPEN = 6;

/** 对齐 A8 Pinia `fo` — 实时赔率缓存 */
export const useOddsStore = defineStore("odds", {
  state: () => ({
    /** platform → oddsId → entry */
    data: new Map<PlatformId, Map<string, OddsEntry>>(),
    /** platform → betId → oddsId[] */
    betIndex: new Map<PlatformId, Map<string, string[]>>(),
    /**
     * OB/MQTT 可能先收到锁盘事件，再收到该盘口的 odds（betIndex 还没建立）。
     * 这里缓存“盘口锁盘状态”，确保后续 save() 时能正确应用。
     */
    pendingBetLocks: new Map<PlatformId, Map<string, boolean>>(),
    /**
     * 同理：odd 级别锁盘可能先到（applyObOddLock 时 isOdds=false 被跳过）。
     * 这里缓存“odd 锁盘状态”，在后续 save() 时应用。
     */
    pendingOddLocks: new Map<PlatformId, Map<string, boolean>>(),
    /** platform → last WS payload (debug) */
    messages: new Map<PlatformId, string>(),
    /** platform → oddsId → limit */
    limits: new Map<PlatformId, Map<string, LimitEntry>>(),
    /** platform:oddsId → 涨跌闪烁 */
    flash: new Map<string, { dir: OddsFlashDir; until: number }>(),
    revision: 0,
  }),

  actions: {
    /** 对齐 A8 `fo.save`：HTTP / MQTT 均直接写入，无时间戳挡板 */
    save(platform: PlatformId, entry: OddsEntry, source: OddsSaveSource = "http") {
      const id = String(entry.id);
      if (!this.data.has(platform)) this.data.set(platform, new Map());
      const bucket = this.data.get(platform)!;
      const prev = bucket.get(id);
      const nextOdds = entry.odds;

      // 先应用“待处理锁盘”（解决：锁盘消息早到、betIndex 尚未建立导致 UI 仍显示赔率）
      const pendingOddLocked = this.pendingOddLocks.get(platform)?.get(id);
      if (pendingOddLocked !== undefined) entry.isLock = pendingOddLocked;
      if (entry.betId) {
        const betLocked = this.pendingBetLocks.get(platform)?.get(String(entry.betId));
        if (betLocked !== undefined) entry.isLock = betLocked;
      }

      if (
        prev &&
        !entry.isLock &&
        !prev.isLock &&
        prev.odds > 0 &&
        nextOdds > 0 &&
        prev.odds !== nextOdds
      ) {
        this.flash.set(`${platform}:${id}`, {
          dir: nextOdds > prev.odds ? "up" : "down",
          until: Date.now() + ODDS_FLASH_MS,
        });
      }
      bucket.set(id, { ...entry, id, source });
      this.revision += 1;

      if (entry.betId) {
        const betId = String(entry.betId);
        if (!this.betIndex.has(platform)) this.betIndex.set(platform, new Map());
        const idx = this.betIndex.get(platform)!;
        const list = idx.get(betId) ?? [];
        if (!list.includes(id)) {
          list.push(id);
          idx.set(betId, list);
        }
      }
    },

    getFlash(platform: PlatformId, oddsId: string): OddsFlashDir | undefined {
      const key = `${platform}:${String(oddsId)}`;
      const row = this.flash.get(key);
      if (!row) return undefined;
      if (row.until < Date.now()) {
        this.flash.delete(key);
        return undefined;
      }
      return row.dir;
    },

    resolveOddsIdForBetSide(
      platform: PlatformId,
      betId: string,
      side: "home" | "away",
      homeId: string,
      awayId: string,
    ): string {
      const primary = side === "home" ? homeId : awayId;
      const bucket = this.data.get(platform);
      if (bucket?.has(String(primary))) return String(primary);
      const ids = this.betIndex.get(platform)?.get(String(betId));
      if (ids?.length) {
        for (const id of ids) {
          if (bucket?.get(id)?.side === side) return id;
        }
      }
      return String(primary);
    },

    getFlashForBetSide(
      platform: PlatformId,
      betId: string,
      side: "home" | "away",
      homeId: string,
      awayId: string,
    ): OddsFlashDir | undefined {
      return this.getFlash(
        platform,
        this.resolveOddsIdForBetSide(platform, betId, side, homeId, awayId),
      );
    },

    isOdds(platform: PlatformId, oddsId: string): boolean {
      return Boolean(this.data.get(platform)?.has(String(oddsId)));
    },

    getEntry(platform: PlatformId, oddsId: string): OddsEntry | undefined {
      return this.data.get(platform)?.get(String(oddsId));
    },

    /** 对齐 A8 `fo.getOdds`：有缓存条目时只用缓存值，不用 fallback 顶替 0 */
    getOdds(platform: PlatformId, oddsId: string, fallback = 0): number {
      const row = this.data.get(platform)?.get(String(oddsId));
      if (row === undefined) return formatDisplayOdds(fallback);
      if (row.isLock) return 0;
      return formatDisplayOdds(row.odds);
    },

    /** 按盘口 + 主客边解析（Sources.HomeID 与 fo 不一致时回退到 betIndex） */
    getOddsForBetSide(
      platform: PlatformId,
      betId: string,
      side: "home" | "away",
      homeId: string,
      awayId: string,
      fallback = 0,
    ): number {
      const primary = side === "home" ? homeId : awayId;
      const bucket = this.data.get(platform);
      if (bucket?.has(String(primary))) {
        return this.getOdds(platform, primary, fallback);
      }
      const ids = this.betIndex.get(platform)?.get(String(betId));
      if (ids?.length) {
        for (const id of ids) {
          const row = bucket?.get(id);
          if (row?.side === side) return this.getOdds(platform, id, fallback);
        }
      }
      return this.getOdds(platform, primary, fallback);
    },

    updateOddsLock(platform: PlatformId, oddsId: string, locked: boolean) {
      if (!this.pendingOddLocks.has(platform)) this.pendingOddLocks.set(platform, new Map());
      this.pendingOddLocks.get(platform)!.set(String(oddsId), locked);
      const row = this.data.get(platform)?.get(String(oddsId));
      if (row) {
        row.isLock = locked;
        this.revision += 1;
      }
    },

    updateBetLock(platform: PlatformId, betId: string, locked: boolean) {
      if (!this.pendingBetLocks.has(platform)) this.pendingBetLocks.set(platform, new Map());
      this.pendingBetLocks.get(platform)!.set(String(betId), locked);
      const ids = this.betIndex.get(platform)?.get(String(betId));
      if (!ids) return;
      for (const id of ids) this.updateOddsLock(platform, id, locked);
    },

    /** OB 单条赔率锁盘（MQTT odd.*） */
    applyObOddLock(
      platform: PlatformId,
      row: { id?: unknown; status?: unknown; visible?: unknown; suspended?: unknown },
      topic: string,
    ) {
      const oddsId = String(row.id ?? "");
      if (!oddsId) return;
      let locked = false;
      if (topic === "/odd/suspended/") {
        locked = Number(row.suspended) === 1;
      } else if (topic === "/odd/visible/") {
        locked = Number(row.visible) !== 1;
      } else if (topic === "/odd/statusUpdate/") {
        if (row.status !== undefined) locked = Number(row.status) !== OB_MARKET_OPEN;
      }
      this.updateOddsLock(platform, oddsId, locked);
    },

    updateMessage(platform: PlatformId, payload: string) {
      this.messages.set(platform, payload);
    },

    clean(platform?: PlatformId) {
      if (platform) {
        this.data.set(platform, new Map());
        this.betIndex.set(platform, new Map());
        this.pendingBetLocks.set(platform, new Map());
        this.pendingOddLocks.set(platform, new Map());
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
