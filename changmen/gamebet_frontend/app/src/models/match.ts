import type { BetRowDto, ClientMatchDto, PlatformId } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import type { UserConfig } from "@/types/userConfig";
import { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import { useOddsStore } from "@/stores/oddsStore";
import { sortOptionsByWinRate } from "@/shared/winRate";

export type BetSide = "Home" | "Away";

function syncObItemIdsFromFo(
  item: ViewBetItem,
  oddsStore: ReturnType<typeof useOddsStore>,
) {
  const home = oddsStore.resolveOddsIdForBetSide(
    item.type,
    item.betId,
    "home",
    item.homeId,
    item.awayId,
  );
  const away = oddsStore.resolveOddsIdForBetSide(
    item.type,
    item.betId,
    "away",
    item.homeId,
    item.awayId,
  );
  if (home && home !== item.homeId) item.homeId = home;
  if (away && away !== item.awayId) item.awayId = away;
}

export class ViewBetItem {
  type: PlatformId;
  matchId: string;
  betId: string;
  homeId: string;
  awayId: string;
  fallbackHomeOdds: number;
  fallbackAwayOdds: number;

  constructor(source: BetRowDto["Sources"][string], providerMatchId: string) {
    this.type = source.Type;
    this.matchId = providerMatchId;
    this.betId = source.BetID;
    this.homeId = source.HomeID;
    this.awayId = source.AwayID;
    // 对齐 A8 `BQ`：OB 不用 GetMatchs 快照当初值，只信 fo + updateOdds
    if (source.Type === PLATFORMS.OB) {
      this.fallbackHomeOdds = 0;
      this.fallbackAwayOdds = 0;
    } else {
      this.fallbackHomeOdds = Number(source.HomeOdds) || 0;
      this.fallbackAwayOdds = Number(source.AwayOdds) || 0;
    }
  }

  getItemId(side: BetSide) {
    return side === "Home" ? this.homeId : this.awayId;
  }

  getOdds(side: BetSide) {
    const oddsStore = useOddsStore();
    const fallback = side === "Home" ? this.fallbackHomeOdds : this.fallbackAwayOdds;
    if (this.type === PLATFORMS.OB) {
      const foSide = side === "Home" ? "home" : "away";
      return (
        oddsStore.getOddsForBetSide(
          this.type,
          this.betId,
          foSide,
          this.homeId,
          this.awayId,
          fallback,
        ) || 0
      );
    }
    return oddsStore.getOdds(this.type, this.getItemId(side), fallback) || 0;
  }

  /** 对齐 A8 `BQ.updateOdds`：把 fo 当前值写回 fallback，供 maxOdds 等使用 */
  updateOdds() {
    const oddsStore = useOddsStore();
    if (this.type === PLATFORMS.OB) {
      this.fallbackHomeOdds =
        oddsStore.getOddsForBetSide(this.type, this.betId, "home", this.homeId, this.awayId, 0) ||
        0;
      this.fallbackAwayOdds =
        oddsStore.getOddsForBetSide(this.type, this.betId, "away", this.homeId, this.awayId, 0) ||
        0;
      syncObItemIdsFromFo(this, oddsStore);
      return;
    }
    this.fallbackHomeOdds = this.getOdds("Home");
    this.fallbackAwayOdds = this.getOdds("Away");
  }
}

export class ViewBet {
  id: number;
  homeName: string;
  awayName: string;
  name: string;
  round: number;
  items: ViewBetItem[];
  isLive?: boolean;
  startTime?: number;

  constructor(row: BetRowDto, providers: Record<string, string | number>, liveRound: number, roundStart: number) {
    this.id = row.ID;
    this.homeName = row.HomeName;
    this.awayName = row.AwayName;
    this.name = row.Name;
    this.round = row.Map;
    if (liveRound !== 0 && liveRound === this.round) {
      this.isLive = true;
      this.startTime = roundStart;
    }
    this.items = Object.values(row.Sources).map(
      (s) => new ViewBetItem(s, String(providers[s.Type] ?? "")),
    );
  }

  getBetName(): string {
    if (this.round === -1) return this.name ?? "";
    if (this.round === 0) return "全场胜负";
    return `[地图${this.round}] 获胜`;
  }

  maxOdds(side: BetSide): number {
    const fallbackKey = side === "Home" ? "fallbackHomeOdds" : "fallbackAwayOdds";
    let max = 0;
    for (const item of this.items) {
      const v = item[fallbackKey];
      if (v > max) max = v;
    }
    return max;
  }

  /** 对齐 A8 `IQ.GetOrderOptions`：`providerKeys` 来自 `getProviders()`，`accounts` 仅用于 profit 覆盖 */
  getOrderOptions(
    match: ViewMatch,
    config: UserConfig,
    providerKeys: PlatformId[],
    accounts: PlatformAccount[] = [],
  ): BetOption[] | undefined {
    if (!config) return undefined;

    const allowSame = new Set(config.allowSameBet ?? []);

    const homeCandidates = this.items.filter((v) => {
      if (
        config.noSameBet &&
        !allowSame.has(v.type) &&
        this.isBetExcludedByNoSameRule(v.type, "Away")
      ) {
        return false;
      }
      return (
        v.getOdds("Home") >= config.minOdds &&
        v.getOdds("Home") > 0 &&
        providerKeys.includes(v.type)
      );
    });
    const homeItem = homeCandidates.reduce<ViewBetItem | undefined>((best, cur) => {
      const odds = cur.getOdds("Home");
      if (!best || odds > best.getOdds("Home")) return cur;
      return best;
    }, undefined);

    const awayCandidates = this.items.filter((v) => {
      if (homeItem && homeItem.type === v.type) return false;
      if (
        config.noSameBet &&
        !allowSame.has(v.type) &&
        this.isBetExcludedByNoSameRule(v.type, "Away")
      ) {
        return false;
      }
      return (
        v.getOdds("Away") >= config.minOdds &&
        v.getOdds("Away") > 0 &&
        providerKeys.includes(v.type)
      );
    });
    const awayItem = awayCandidates.reduce<ViewBetItem | undefined>((best, cur) => {
      const odds = cur.getOdds("Away");
      if (!best || odds > best.getOdds("Away")) return cur;
      return best;
    }, undefined);

    if (!homeItem || !awayItem) return undefined;

    const homeOdds = homeItem.getOdds("Home");
    const awayOdds = awayItem.getOdds("Away");
    const implied = 1 / (1 / homeOdds + 1 / awayOdds);
    let targetProfit = config.profit;
    const profitOverrides = accounts.filter(
      (a) =>
        a.profit !== 0 &&
        (a.provider === homeItem.type || a.provider === awayItem.type),
    );
    if (profitOverrides.length) {
      targetProfit = Math.max(...profitOverrides.map((a) => Number(a.profit)));
    }
    if (implied < targetProfit || implied > config.maxProfit) return undefined;

    let betMoney = config.betMoney;
    const low = Math.min(homeOdds, awayOdds);
    const high = Math.max(homeOdds, awayOdds);
    let hedgeMoney = (low * betMoney) / high;
    if (config.tenNumber) hedgeMoney = Math.round(hedgeMoney / 10) * 10;

    const options: BetOption[] =
      homeOdds < awayOdds
        ? [
            new BetOption(match, this, homeItem, "Home", betMoney),
            new BetOption(match, this, awayItem, "Away", hedgeMoney),
          ]
        : [
            new BetOption(match, this, awayItem, "Away", betMoney),
            new BetOption(match, this, homeItem, "Home", hedgeMoney),
          ];

    switch (config.betSorting) {
      case "Low":
        options.sort((a, b) => (a.odds < b.odds ? -1 : 1));
        break;
      case "High":
        options.sort((a, b) => (a.odds > b.odds ? -1 : 1));
        break;
      case "Parallel":
        break;
      case "WinRate": {
        const byWinRate = sortOptionsByWinRate(options, config);
        if (byWinRate) {
          options.splice(0, options.length, ...byWinRate);
        } else {
          options.sort(
            (a, b) =>
              config.providerSortValue.indexOf(a.type) -
              config.providerSortValue.indexOf(b.type),
          );
        }
        break;
      }
      case "Custom":
        options.sort(
          (a, b) =>
            config.providerSortValue.indexOf(a.type) - config.providerSortValue.indexOf(b.type),
        );
        break;
      default:
        options.sort(
          (a, b) =>
            config.providerSortValue.indexOf(a.type) - config.providerSortValue.indexOf(b.type),
        );
    }

    if (options.some((o) => config.providerFixed.includes(o.type))) {
      options.sort(
        (a, b) =>
          config.providerFixed.indexOf(b.type) - config.providerFixed.indexOf(a.type),
      );
    }

    return options;
  }

  /** 对齐 bundle `isBet`（当前 bundle 为空实现，保留钩子供后续扩展） */
  isBetExcludedByNoSameRule(_type: PlatformId, _side: BetSide): boolean {
    return false;
  }
}

export class ViewMatch {
  id: number;
  title: string;
  game: string;
  gameId: number;
  bo: number;
  startAt: number;
  reverse: PlatformId[];
  providers: Record<string, string | number>;
  bets: ViewBet[];

  constructor(dto: ClientMatchDto) {
    this.id = dto.ID;
    this.title = dto.Title;
    this.game = dto.Game;
    this.gameId = dto.GameID;
    this.bo = Number(dto.BO) || 0;
    this.startAt = dto.StartTime;
    this.reverse = dto.Reverse ?? [];
    this.providers = dto.Matchs ?? {};
    const liveRound = dto.Round ?? 0;
    const roundStart = dto.RoundStart ?? 0;
    this.bets = (dto.Bets ?? []).map((b) => new ViewBet(b, this.providers, liveRound, roundStart));
  }
}

export function toViewMatches(list: ClientMatchDto[]): ViewMatch[] {
  return list.map((m) => new ViewMatch(m));
}
