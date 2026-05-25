import { defineStore } from "pinia";
import { getMatchs } from "@/api/esport";
import { toViewMatches, type ViewMatch } from "@/models/match";
import type { BetSide } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import { useOddsStore } from "@/stores/oddsStore";
import { useUserStore } from "@/stores/userStore";

const POLL_MS = 30_000;
const BET_TARGET_KEY = "BetTarget";

/** 对齐 A8 Pinia `Vg`（比赛树 + 轮询 + BetTarget） */
export const useMatchStore = defineStore("match", {
  state: () => ({
    matchs: [] as ViewMatch[],
    loading: false,
    error: null as string | null,
    lastFetchAt: 0,
    /** platform → betRowId → Home|Away */
    betTargets: new Map<PlatformId, Map<number, BetSide>>(),
    pollTimer: null as ReturnType<typeof setInterval> | null,
    tick: 0,
  }),

  getters: {
    matchCount: (s) => s.matchs.length,
  },

  actions: {
    async initBetTarget() {
      this.betTargets = await this.loadBetTarget();
    },

    loadBetTarget(): Map<PlatformId, Map<number, BetSide>> {
      const empty = new Map<PlatformId, Map<number, BetSide>>();
      try {
        const raw = sessionStorage.getItem(BET_TARGET_KEY);
        if (!raw) return empty;
        const parsed = JSON.parse(raw) as Record<string, Record<string, BetSide>>;
        for (const [platform, bets] of Object.entries(parsed)) {
          const map = new Map<number, BetSide>();
          for (const [betId, side] of Object.entries(bets)) {
            map.set(Number(betId), side);
          }
          empty.set(platform as PlatformId, map);
        }
      } catch {
        /* ignore */
      }
      return empty;
    },

    persistBetTarget() {
      const out: Record<string, Record<number, BetSide>> = {};
      this.betTargets.forEach((bets, platform) => {
        const row: Record<number, BetSide> = {};
        bets.forEach((side, betId) => {
          row[betId] = side;
        });
        out[platform] = row;
      });
      sessionStorage.setItem(BET_TARGET_KEY, JSON.stringify(out));
    },

    getBetTarget(platform: PlatformId, betRowId: number): BetSide | undefined {
      return this.betTargets.get(platform)?.get(betRowId);
    },

    setBetTarget(platform: PlatformId, betRowId: number, side: BetSide) {
      const user = useUserStore();
      if (!user.betTargetEnabled()) return false;
      if (!this.betTargets.has(platform)) this.betTargets.set(platform, new Map());
      const bucket = this.betTargets.get(platform)!;
      if (bucket.get(betRowId) === side) bucket.delete(betRowId);
      else bucket.set(betRowId, side);
      this.persistBetTarget();
      return true;
    },

    refreshOddsOnBets() {
      const odds = useOddsStore();
      for (const match of this.matchs) {
        for (const bet of match.bets) {
          for (const item of bet.items) {
            item.fallbackHomeOdds =
              odds.getOdds(item.type, item.homeId, item.fallbackHomeOdds) || 0;
            item.fallbackAwayOdds =
              odds.getOdds(item.type, item.awayId, item.fallbackAwayOdds) || 0;
          }
        }
      }
      this.tick += 1;
    },

    async fetchMatches(force = false) {
      const user = useUserStore();
      if (!user.isLoggedIn) return;
      const now = Date.now();
      if (!force && now - this.lastFetchAt < POLL_MS) return;

      this.loading = true;
      this.error = null;
      try {
        const list = await getMatchs(user.userName);
        this.matchs = toViewMatches(list);
        this.lastFetchAt = Date.now();
        this.refreshOddsOnBets();
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.loading = false;
      }
    },

    startPolling() {
      this.stopPolling();
      void this.fetchMatches(true);
      this.pollTimer = setInterval(() => {
        void this.fetchMatches(true);
      }, POLL_MS);
    },

    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },
  },
});
