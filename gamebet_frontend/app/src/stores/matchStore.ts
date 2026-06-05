import { defineStore } from "pinia";
import { getMatchs } from "@/api/esport";
import { getToken, getRefreshToken } from "@/api/client";
import { getMatchDefaultOdds } from "@/api/report";
import { toViewMatches, type ViewMatch } from "@/models/match";
import type { BetSide } from "@/models/match";
import type { ClientMatchDto, PlatformId } from "@/types/esport";
import type { MatchScoreBoard, PlatformScoreUpdate, ScoreRound } from "@/types/matchScore";
import { useUserStore } from "@/stores/userStore";

const POLL_MS = 30_000;
const DEFAULT_ODDS_MS = 10 * 60 * 1000;
const BET_TARGET_KEY = "BetTarget";

// Supabase Realtime channel — 模块级变量，避免 Pinia 序列化问题
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _realtimeChannel: any = null;

/** Supabase client_matches 行 → ClientMatchDto */
function rowToDto(row: Record<string, unknown>): ClientMatchDto {
  return {
    ID:        Number(row.id)         || 0,
    Title:     String(row.title       ?? ""),
    Game:      String(row.game        ?? ""),
    GameID:    row.game_id            as number,
    StartTime: Number(row.start_time) || 0,
    BO:        Number(row.bo)         || 0,
    Round:     Number(row.round)      || 0,
    Matchs:    (row.matchs            as Record<string, string | number>) ?? {},
    Bets:      Array.isArray(row.bets) ? row.bets : [],
  };
}

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
    /** true = 正在使用 Supabase Realtime，false = 轮询兜底 */
    usingRealtime: false,
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

    /** 启动轮询兜底（Realtime 不可用时使用） */
    _startPollTimer() {
      if (this.pollTimer) return;
      this.pollTimer = setInterval(() => void this.fetchMatches(true), POLL_MS);
    },

    /** Realtime 收到单行变更时更新 matchs */
    _applyRealtimeEvent(eventType: string, row: Record<string, unknown>) {
      if (eventType === "DELETE") {
        const id = Number(row.id);
        this.matchs = this.matchs.filter((m) => m.id !== id);
      } else {
        const [incoming] = toViewMatches([rowToDto(row)]);
        if (!incoming) return;
        const idx = this.matchs.findIndex((m) => m.id === incoming.id);
        if (idx >= 0) this.matchs.splice(idx, 1, incoming);
        else this.matchs.push(incoming);
        this.matchs.sort((a, b) => a.startAt - b.startAt);
      }
      this.refreshOddsOnBets();
    },

    async startPolling() {
      this.stopPolling();

      // 全量初始加载
      await this.fetchMatches(true);
      void this.fetchMatchDefaultOdds();

      // 始终启动的两个定时器（与 Realtime 无关）
      this.oddsRefreshTimer = setInterval(() => this.refreshOddsOnBets(), 200);
      this.defaultOddsTimer = setInterval(() => void this.fetchMatchDefaultOdds(), DEFAULT_ODDS_MS);

      // 尝试 Supabase Realtime
      const jwt = getToken();
      const rft = getRefreshToken();
      if (jwt && rft) {
        try {
          const { initSupabaseClient } = await import("@/lib/supabase");
          const client = await initSupabaseClient(jwt, rft);
          if (client) {
            _realtimeChannel = client
              .channel("client_matches")
              .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "client_matches" },
                (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
                  const row = payload.eventType === "DELETE" ? payload.old : payload.new;
                  this._applyRealtimeEvent(payload.eventType, row);
                },
              )
              .subscribe((status: string) => {
                if (status === "SUBSCRIBED") {
                  this.usingRealtime = true;
                  console.log("[matchStore] Realtime 已连接");
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                  // Realtime 失败 → 回退 30s 轮询
                  this.usingRealtime = false;
                  console.warn("[matchStore] Realtime 失败，回退轮询");
                  this._startPollTimer();
                }
              });
            return; // 等待 subscribe 回调决定是否需要 fallback
          }
        } catch (e) {
          console.warn("[matchStore] Realtime 初始化异常:", e);
        }
      }

      // 无 Supabase 配置或初始化失败 → 直接轮询
      this._startPollTimer();
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
      if (_realtimeChannel) {
        _realtimeChannel.unsubscribe();
        _realtimeChannel = null;
      }
      this.usingRealtime = false;
      import("@/lib/supabase").then(({ destroySupabaseClient }) => destroySupabaseClient()).catch(() => {});
    },
  },
});
