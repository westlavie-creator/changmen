import type { ClientMatchDto } from "@/types/esport";
import type { ViewMatch } from "@/models/match";
import { defineStore } from "pinia";
import { toViewMatches } from "@/models/match";
import { useUserStore } from "@/stores/userStore";

export type SportListFetch = (userName: string) => Promise<ClientMatchDto[]>;

export interface SportListStoreOptions {
  /** pinia store id */
  id: string;
  fetchList: SportListFetch;
  pollMs?: number;
  minFetchGapMs?: number;
}

/**
 * [changmen 扩展] 体育只读盘：列表响应即赔率快照，无 A8 采集写 fo。
 * 不写 oddsStore（避免冒充电竞 fo）；在已构造的 ViewBetItem 上补 fallback。
 * ViewBetItem 构造仍保持 [A8 可证实]：非 HG fallback=0。matchStore / 电竞路径不变。
 */
function applySportListSourceOdds(views: ViewMatch[], list: ClientMatchDto[]): ViewMatch[] {
  const byId = new Map(list.map(m => [m.ID, m]));
  for (const vm of views) {
    const dto = byId.get(vm.id);
    if (!dto)
      continue;
    for (const bet of vm.bets) {
      const dtoBet = dto.Bets?.find(b => b.ID === bet.id);
      if (!dtoBet)
        continue;
      for (const item of bet.items) {
        const src = dtoBet.Sources?.[item.type]
          ?? Object.values(dtoBet.Sources ?? {}).find(s => (s?.Type || "") === item.type);
        if (!src)
          continue;
        const locked = String(src.Status ?? "").toLowerCase() === "locked";
        item.fallbackHomeOdds = locked ? 0 : (Number(src.HomeOdds) || 0);
        item.fallbackAwayOdds = locked ? 0 : (Number(src.AwayOdds) || 0);
        item.sourceStatus = String(src.Status ?? "Normal");
        // [changmen 扩展] WS 订阅键：PF 必须用 marketId；缺省则空（勿把 onChainId 当 market 订）
        if (item.type === "PredictFun") {
          const homeM = String(src.HomeMarketID ?? "").trim();
          const awayM = String(src.AwayMarketID ?? "").trim();
          item.homeSubscribeId = homeM;
          item.awaySubscribeId = awayM;
        }
        else {
          item.homeSubscribeId = String(src.HomeID || "");
          item.awaySubscribeId = String(src.AwayID || "");
        }
      }
    }
  }
  return views;
}

/** 非电竞只读列表 store 工厂；不进 matchStore 套利主循环 */
export function createSportListStore(options: SportListStoreOptions) {
  const pollMs = options.pollMs ?? 30_000;
  const minFetchGapMs = options.minFetchGapMs ?? 5_000;

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
          this.matchs = applySportListSourceOdds(toViewMatches(list), list);
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
