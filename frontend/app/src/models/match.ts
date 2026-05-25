import type { BetRowDto, ClientMatchDto, PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { BetOption } from "@/models/betOption";
import { useOddsStore } from "@/stores/oddsStore";

export type BetSide = "Home" | "Away";

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
    this.fallbackHomeOdds = Number(source.HomeOdds) || 0;
    this.fallbackAwayOdds = Number(source.AwayOdds) || 0;
  }

  getItemId(side: BetSide) {
    return side === "Home" ? this.homeId : this.awayId;
  }

  getOdds(side: BetSide) {
    const oddsStore = useOddsStore();
    const id = this.getItemId(side);
    const fallback = side === "Home" ? this.fallbackHomeOdds : this.fallbackAwayOdds;
    return oddsStore.getOdds(this.type, id, fallback) || 0;
  }

  updateOdds() {
    const oddsStore = useOddsStore();
    this.fallbackHomeOdds = oddsStore.getOdds(this.type, this.homeId, this.fallbackHomeOdds) || 0;
    this.fallbackAwayOdds = oddsStore.getOdds(this.type, this.awayId, this.fallbackAwayOdds) || 0;
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

  /** 对齐 A8 `IQ.GetOrderOptions` */
  getOrderOptions(
    match: ViewMatch,
    config: UserConfig,
    providerKeys: PlatformId[],
  ): BetOption[] | undefined {
    if (!config) return undefined;

    const homeCandidates = this.items.filter(
      (v) =>
        v.getOdds("Home") >= config.minOdds &&
        v.getOdds("Home") > 0 &&
        providerKeys.includes(v.type),
    );
    const homeItem = homeCandidates.reduce<ViewBetItem | undefined>((best, cur) => {
      const odds = cur.getOdds("Home");
      if (!best || odds > best.getOdds("Home")) return cur;
      return best;
    }, undefined);

    const awayCandidates = this.items.filter(
      (v) =>
        (!homeItem || homeItem.type !== v.type) &&
        v.getOdds("Away") >= config.minOdds &&
        v.getOdds("Away") > 0 &&
        providerKeys.includes(v.type),
    );
    const awayItem = awayCandidates.reduce<ViewBetItem | undefined>((best, cur) => {
      const odds = cur.getOdds("Away");
      if (!best || odds > best.getOdds("Away")) return cur;
      return best;
    }, undefined);

    if (!homeItem || !awayItem) return undefined;

    const homeOdds = homeItem.getOdds("Home");
    const awayOdds = awayItem.getOdds("Away");
    const implied = 1 / (1 / homeOdds + 1 / awayOdds);
    const targetProfit = config.profit;
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
}

export class ViewMatch {
  id: number;
  title: string;
  game: string;
  gameId: number;
  startAt: number;
  reverse: PlatformId[];
  providers: Record<string, string | number>;
  bets: ViewBet[];

  constructor(dto: ClientMatchDto) {
    this.id = dto.ID;
    this.title = dto.Title;
    this.game = dto.Game;
    this.gameId = dto.GameID;
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
