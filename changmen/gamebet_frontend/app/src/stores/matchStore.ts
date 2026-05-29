import { defineStore } from "pinia";
import { getMatchs } from "@/api/esport";
import { getMatchDefaultOdds } from "@/api/report";
import { toViewMatches, type ViewMatch } from "@/models/match";
import type { BetSide } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import type { MatchScoreBoard, PlatformScoreUpdate, ScoreRound } from "@/types/matchScore";
import { PLATFORMS } from "@/shared/platform";
import { useCollectStore } from "@/stores/collectStore";
import { useUserStore } from "@/stores/userStore";

const POLL_MS = 30_000;
const DEFAULT_ODDS_MS = 10 * 60 * 1000;
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
    /** 从 fo 同步到 ViewBetItem.fallback，对齐 A8 高频 updateOdds */
    oddsRefreshTimer: null as ReturnType<typeof setInterval> | null,
    /** 对齐 bundle：约 10 分钟拉一次初赔（不依赖仅打开页面 2 分钟） */
    defaultOddsTimer: null as ReturnType<typeof setInterval> | null,
    tick: 0,
    /** matchId → 局比分（对齐 A8 `Vg.score` / `eBe`） */
    score: new Map<number, MatchScoreBoard>(),
    /** key `${betId}:Home|Away`（对齐 A8 `defaultOdds`） */
    defaultOdds: new Map<string, number>(),
    defaultOddsFetchedAt: 0,
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
      for (const match of this.matchs) {
        for (const bet of match.bets) {
          for (const item of bet.items) {
            item.updateOdds();
          }
        }
      }
      this.tick += 1;
    },

    getRoundScore(matchId: number, round: number): ScoreRound | undefined {
      return this.score.get(matchId)?.score.get(round);
    },

    getDefaultOdds(betId: number, side: BetSide): number {
      return this.defaultOdds.get(`${betId}:${side}`) ?? 0;
    },

    /** 对齐 A8 `Vg.updateScore` */
    updateScore(platform: PlatformId, rows: PlatformScoreUpdate[]) {
      for (const row of rows) {
        const sourceId = row.SourceID != null ? String(row.SourceID) : "";
        if (!sourceId) continue;
        const match = this.matchs.find((m) => String(m.providers[platform] ?? "") === sourceId);
        if (!match) continue;
        const reversed = match.reverse.includes(platform);
        const board = new Map<number, ScoreRound>();
        for (const [roundKey, raw] of Object.entries(row.Score ?? {})) {
          const home = raw.Home ?? "";
          const away = raw.Away ?? "";
          board.set(
            Number(roundKey),
            reversed ? { Home: away, Away: home } : { Home: home, Away: away },
          );
        }
        this.score.set(match.id, { score: board });
      }
      this.tick += 1;
    },

    async fetchMatchDefaultOdds() {
      const user = useUserStore();
      if (!user.isLoggedIn) return;
      const ids = this.matchs.map((m) => m.id);
      if (!ids.length) return;
      try {
        const info = await getMatchDefaultOdds(ids);
        const next = new Map<string, number>();
        for (const [key, value] of Object.entries(info ?? {})) {
          next.set(key, Number(value) || 0);
        }
        this.defaultOdds = next;
        this.defaultOddsFetchedAt = Date.now();
        this.tick += 1;
      } catch {
        /* 后端未实现时保持空 Map */
      }
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
        if (useCollectStore().isEnabled(PLATFORMS.OB)) {
          const { syncObMqttSubscriptionsForGetMatchs } = await import("@/collectors/ob/mqtt");
          await syncObMqttSubscriptionsForGetMatchs(this.matchs);
        }
        this.refreshOddsOnBets();
        if (Date.now() - this.defaultOddsFetchedAt > DEFAULT_ODDS_MS) {
          await this.fetchMatchDefaultOdds();
        }
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.loading = false;
      }
    },

    startPolling() {
      this.stopPolling();
      void this.fetchMatches(true);
      void this.fetchMatchDefaultOdds();
      this.pollTimer = setInterval(() => {
        void this.fetchMatches(true);
      }, POLL_MS);
      this.oddsRefreshTimer = setInterval(() => {
        this.refreshOddsOnBets();
      }, 200);
      this.defaultOddsTimer = setInterval(() => {
        void this.fetchMatchDefaultOdds();
      }, DEFAULT_ODDS_MS);
    },

    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.oddsRefreshTimer) {
        clearInterval(this.oddsRefreshTimer);
        this.oddsRefreshTimer = null;
      }
      if (this.defaultOddsTimer) {
        clearInterval(this.defaultOddsTimer);
        this.defaultOddsTimer = null;
      }
    },
  },
});
