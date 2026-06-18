import { defineStore } from "pinia";
import { getMatchs } from "@/api/esport";
import { getToken } from "@/api/client";
import { ensureTokenRefresh } from "@/lib/sessionRefresh";
import { getMatchDefaultOdds } from "@/api/report";
import { toViewMatches, type ViewMatch } from "@/models/match";
import type { BetSide } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import type { MatchScoreBoard, PlatformScoreUpdate, ScoreRound } from "@/types/matchScore";
import {
  runMainBetLoopFinally,
  runMainBetLoopTick,
  type MainBetLoopState,
} from "@/stores/match/mainBetLoop";
import { useUserStore } from "@/stores/userStore";

const POLL_MS = 30_000;
const DEFAULT_ODDS_MS = 10 * 60 * 1000;
const BET_TARGET_KEY = "BetTarget";

/** 对齐 A8 Pinia `zg`：只消费 Client_GetMatchs，不在前端做赛事合并 */
export const useMatchStore = defineStore("match", {
  state: () => ({
    matchs: [] as ViewMatch[],
    loading: false,
    error: null as string | null,
    lastFetchAt: 0,
    /** platform → betRowId → Home|Away */
    betTargets: new Map<PlatformId, Map<number, BetSide>>(),
    tick: 0,
    /** matchId → 局比分（对齐 A8 `Vg.score` / `eBe`） */
    score: new Map<number, MatchScoreBoard>(),
    /** key `${betId}:Home|Away`（对齐 A8 `defaultOdds`） */
    defaultOdds: new Map<string, number>(),
    defaultOddsFetchedAt: 0,
    /** [A8 可证实] 单主循环 `P()` 是否在跑 */
    mainLoopRunning: false,
    mainLoopTimer: null as ReturnType<typeof setTimeout> | null,
    lastLoseOrderPruneAt: 0,
  }),

  getters: {
    matchCount: (s) => s.matchs.length,
  },

  actions: {
    async initBetTarget() {
      this.betTargets = await this.loadBetTarget();
    },

    loadBetTarget(): Map<PlatformId, Map<number, BetSide>> {
      return this.parseBetTargetPayload(this.readBetTargetSession());
    },

    /** 对齐 A8 `Vg.loadBetTarget(r)`：GoEasy BetTarget 频道推送 */
    applyRemoteBetTarget(raw: Record<string, Record<string, BetSide>>) {
      this.betTargets = this.parseBetTargetPayload(raw);
      this.persistBetTarget();
      this.tick += 1;
    },

    readBetTargetSession(): Record<string, Record<string, BetSide>> {
      try {
        const raw = sessionStorage.getItem(BET_TARGET_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as Record<string, Record<string, BetSide>>;
      } catch {
        return {};
      }
    },

    parseBetTargetPayload(
      parsed: Record<string, Record<string, BetSide>>,
    ): Map<PlatformId, Map<number, BetSide>> {
      const empty = new Map<PlatformId, Map<number, BetSide>>();
      for (const [platform, bets] of Object.entries(parsed)) {
        const map = new Map<number, BetSide>();
        for (const [betId, side] of Object.entries(bets ?? {})) {
          map.set(Number(betId), side);
        }
        empty.set(platform as PlatformId, map);
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
      if (!this.betTargets || !(this.betTargets instanceof Map)) {
        this.betTargets = new Map();
      }
      if (!this.betTargets.has(platform)) this.betTargets.set(platform, new Map());
      const bucket = this.betTargets.get(platform)!;
      if (bucket.get(betRowId) === side) bucket.delete(betRowId);
      else bucket.set(betRowId, side);
      this.persistBetTarget();
      return true;
    },

    /** [A8 可证实] P()：有比分时以最高局号覆盖 Round 驱动的 isLive（仅当服务端仍报 liveRound>0） */
    applyScoreDrivenLive(match: ViewMatch) {
      if (!match.liveRound) return;
      const board = this.score.get(match.id);
      if (!board?.score.size) return;
      const maxRound = Math.max(...board.score.keys());
      if (!maxRound) return;
      const liveBet = match.bets.find((b) => b.round === maxRound);
      if (liveBet) {
        liveBet.isLive = true;
        if (!liveBet.startTime || liveBet.startTime <= 0) {
          liveBet.startTime = match.liveRoundStart > 0 ? match.liveRoundStart : Date.now();
        }
      }
      for (const bet of match.bets) {
        if (bet.round !== maxRound && bet.isLive) {
          bet.isLive = undefined;
          bet.startTime = undefined;
        }
      }
    },

    refreshOddsOnBets() {
      for (const match of this.matchs) {
        const lr = match.liveRound;
        const rs = match.liveRoundStart;
        for (const bet of match.bets) {
          if (lr !== 0 && lr === bet.round) {
            bet.isLive = true;
            bet.startTime =
              rs > 0 ? rs : bet.startTime && bet.startTime > 0 ? bet.startTime : Date.now();
          } else {
            bet.isLive = undefined;
            bet.startTime = undefined;
          }
          for (const item of bet.items) {
            item.updateOdds();
          }
        }
        this.applyScoreDrivenLive(match);
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
        this.applyScoreDrivenLive(match);
      }
      this.tick += 1;
    },

    async fetchMatchDefaultOdds() {
      const user = useUserStore();
      if (!user.isLoggedIn) return;
      const ids = this.matchs.map((m) => m.id);
      try {
        const info = await getMatchDefaultOdds(ids);
        if (info && Object.keys(info).length) {
          const next = new Map<string, number>();
          for (const [key, value] of Object.entries(info)) {
            next.set(key, Number(value) || 0);
          }
          this.defaultOdds = next;
        }
        // [A8 可证实] 门控到期即 `b=Date.now()`，空列表也推进计时
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

    /** [A8 可证实] 单主循环：拉列表门控 + 每轮 updateOdds + 自动下单 + wait(100) */
    async startMainLoop() {
      this.stopMainLoop();

      this.mainLoopRunning = true;
      await this.fetchMatches(true);
      void this.fetchMatchDefaultOdds();

      if (getToken()) {
        void ensureTokenRefresh();
      }

      this.scheduleMainLoop(0);
    },

    stopMainLoop() {
      this.mainLoopRunning = false;
      if (this.mainLoopTimer) {
        clearTimeout(this.mainLoopTimer);
        this.mainLoopTimer = null;
      }
    },

    scheduleMainLoop(delayMs: number) {
      if (!this.mainLoopRunning) return;
      if (this.mainLoopTimer) clearTimeout(this.mainLoopTimer);
      this.mainLoopTimer = setTimeout(() => {
        void this.runMainLoopTick();
      }, delayMs);
    },

    async runMainLoopTick() {
      const state: MainBetLoopState = { lastLoseOrderPruneAt: this.lastLoseOrderPruneAt };
      try {
        await runMainBetLoopTick(state);
        this.lastLoseOrderPruneAt = state.lastLoseOrderPruneAt;
      } finally {
        if (!this.mainLoopRunning) return;
        await runMainBetLoopFinally();
        this.scheduleMainLoop(0);
      }
    },

    /** @deprecated 使用 startMainLoop（对齐 A8 `P()`） */
    async startPolling() {
      await this.startMainLoop();
    },
  },
});
