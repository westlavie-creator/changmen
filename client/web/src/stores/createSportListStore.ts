import type { ClientMatchDto, PlatformId } from "@/types/esport";
import type { ViewMatch } from "@/models/match";
import { defineStore } from "pinia";
import { toViewMatches } from "@/models/match";
import { useOddsStore } from "@/stores/oddsStore";
import { useUserStore } from "@/stores/userStore";

export type SportListFetch = (userName: string) => Promise<ClientMatchDto[]>;

export interface SportListStoreOptions {
  /** pinia store id */
  id: string;
  fetchList: SportListFetch;
  /** Sources 里用于 seed oddsStore 的平台 key，默认 Polymarket */
  oddsPlatformKey?: string;
  pollMs?: number;
  minFetchGapMs?: number;
}

function seedPlatformOdds(list: ClientMatchDto[], platformKey: string) {
  // 只读 sport 写入同一 oddsStore：键为 platform+oddId（PM token）。
  // 比赛 ID 已用 idBase（mlb≈900M / soccer≈800M）与电竞错开；勿改电竞 fo 写入路径。
  const odds = useOddsStore();
  for (const match of list) {
    for (const bet of match.Bets ?? []) {
      const src = bet.Sources?.[platformKey];
      if (!src)
        continue;
      const platform = (src.Type || platformKey) as PlatformId;
      const betId = String(src.BetID || "");
      const homeId = String(src.HomeID || "");
      const awayId = String(src.AwayID || "");
      if (homeId) {
        odds.save(platform, {
          id: homeId,
          odds: Number(src.HomeOdds) || 0,
          isLock: false,
          betId,
          side: "home",
          time: Date.now(),
        }, "http");
      }
      if (awayId) {
        odds.save(platform, {
          id: awayId,
          odds: Number(src.AwayOdds) || 0,
          isLock: false,
          betId,
          side: "away",
          time: Date.now(),
        }, "http");
      }
    }
  }
}

/** 非电竞只读列表 store 工厂；不进 matchStore 套利主循环 */
export function createSportListStore(options: SportListStoreOptions) {
  const pollMs = options.pollMs ?? 30_000;
  const minFetchGapMs = options.minFetchGapMs ?? 5_000;
  const oddsPlatformKey = options.oddsPlatformKey ?? "Polymarket";

  return defineStore(options.id, {
    state: () => ({
      matchs: [] as ViewMatch[],
      loading: false,
      error: null as string | null,
      lastFetchAt: 0,
      _timer: null as ReturnType<typeof setInterval> | null,
    }),
    actions: {
      async fetchMatchs(force = false) {
        const now = Date.now();
        if (!force && this.loading)
          return;
        if (!force && this.lastFetchAt && now - this.lastFetchAt < minFetchGapMs)
          return;
        const user = useUserStore();
        if (!user.isLoggedIn || !user.userName)
          return;
        this.loading = true;
        this.error = null;
        try {
          const list = await options.fetchList(user.userName);
          seedPlatformOdds(list, oddsPlatformKey);
          this.matchs = toViewMatches(list);
          this.lastFetchAt = Date.now();
        }
        catch (err) {
          this.error = err instanceof Error ? err.message : String(err);
        }
        finally {
          this.loading = false;
        }
      },
      startPolling() {
        if (this._timer)
          return;
        void this.fetchMatchs(true);
        this._timer = setInterval(() => {
          void this.fetchMatchs();
        }, pollMs);
      },
      stopPolling() {
        if (this._timer) {
          clearInterval(this._timer);
          this._timer = null;
        }
      },
    },
  });
}
