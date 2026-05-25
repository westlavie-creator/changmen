import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { PlatformId } from "@/types/esport";
import { useOddsStore } from "@/stores/oddsStore";

export interface A8BetRow {
  betId?: string | number;
  homeId?: string | number;
  awayId?: string | number;
  home?: number;
  away?: number;
  homeName?: string;
  awayName?: string;
  matchId?: string | number;
  map?: number;
  name?: string;
  locked?: boolean;
  gameId?: string | number;
}

export interface A8BetsMessage {
  matchId?: string | number;
  homeName?: string;
  awayName?: string;
  gameId?: string | number;
  bets?: A8BetRow[];
}

interface MatchAcc {
  matchId: string;
  gameId: string;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  startTime: number;
  bets: Map<string, CollectBetDto>;
}

export class A8BetsCollector {
  private matches = new Map<string, MatchAcc>();

  constructor(
    private platform: PlatformId,
    private opts: {
      homeSuffix: string;
      awaySuffix: string;
      useDirectIds?: boolean;
    },
  ) {}

  oddsIds(bet: A8BetRow) {
    if (this.opts.useDirectIds) {
      return {
        homeId: String(bet.homeId ?? ""),
        awayId: String(bet.awayId ?? ""),
        marketId: String(bet.betId ?? ""),
      };
    }
    const betId = String(bet.betId ?? "");
    return {
      homeId: `${betId}:${this.opts.homeSuffix}`,
      awayId: `${betId}:${this.opts.awaySuffix}`,
      marketId: betId,
    };
  }

  ingest(message: A8BetsMessage) {
    if (!message?.bets?.length) return;
    const odds = useOddsStore();
    const defaultMatchId = message.matchId != null ? String(message.matchId) : null;

    for (const bet of message.bets) {
      const matchId = String(bet.matchId ?? defaultMatchId ?? bet.betId ?? "");
      if (!matchId) continue;

      const ids = this.oddsIds(bet);
      if (!ids.homeId || !ids.awayId) continue;

      const locked = Boolean(bet.locked);
      if (bet.home != null) {
        odds.save(this.platform, {
          id: ids.homeId,
          odds: Number(bet.home) || 0,
          isLock: locked,
          betId: ids.marketId,
          time: Date.now(),
        });
      }
      if (bet.away != null) {
        odds.save(this.platform, {
          id: ids.awayId,
          odds: Number(bet.away) || 0,
          isLock: locked,
          betId: ids.marketId,
          time: Date.now(),
        });
      }

      let acc = this.matches.get(matchId);
      if (!acc) {
        acc = {
          matchId,
          gameId: String(bet.gameId ?? message.gameId ?? "unknown"),
          homeId: String(bet.homeId ?? `${matchId}-home`),
          homeName: String(bet.homeName ?? message.homeName ?? "主队"),
          awayId: String(bet.awayId ?? `${matchId}-away`),
          awayName: String(bet.awayName ?? message.awayName ?? "客队"),
          startTime: Date.now(),
          bets: new Map(),
        };
        this.matches.set(matchId, acc);
      }

      const map = bet.map != null ? Number(bet.map) : 0;
      const label = map === 0 ? "全场" : `地图${map}`;
      acc.bets.set(ids.marketId, {
        Type: this.platform,
        SourceMatchID: matchId,
        SourceBetID: ids.marketId,
        Map: map,
        BetName: bet.name ? String(bet.name) : `[${label}]-胜负`,
        SourceHomeID: ids.homeId,
        HomeName: acc.homeName,
        HomeOdds: Number(bet.home) || 0,
        SourceAwayID: ids.awayId,
        AwayName: acc.awayName,
        AwayOdds: Number(bet.away) || 0,
        Status: locked ? "Locked" : "Normal",
      });
    }
  }

  buildPayload(): { matches: CollectMatchDto[]; betsByMatch: Map<string, CollectBetDto[]> } {
    const matches: CollectMatchDto[] = [];
    const betsByMatch = new Map<string, CollectBetDto[]>();

    for (const acc of this.matches.values()) {
      matches.push({
        Type: this.platform,
        SourceMatchID: acc.matchId,
        SourceGameID: acc.gameId,
        StartTime: acc.startTime,
        Home: acc.homeName,
        HomeID: acc.homeId,
        Away: acc.awayName,
        AwayID: acc.awayId,
        Teams: [
          {
            Type: this.platform,
            GameID: acc.gameId,
            Name: acc.homeName,
            TeamID: acc.homeId,
            Logo: "",
          },
          {
            Type: this.platform,
            GameID: acc.gameId,
            Name: acc.awayName,
            TeamID: acc.awayId,
            Logo: "",
          },
        ],
      });
      betsByMatch.set(acc.matchId, [...acc.bets.values()].sort((a, b) => a.Map - b.Map));
    }

    return { matches, betsByMatch };
  }

  mergeGraphqlMatch(row: {
    matchId: string;
    gameId: string;
    startTime: number;
    home: { id: string; name: string };
    away: { id: string; name: string };
    stages: Array<{
      stageId: number;
      betName: string;
      winMarketId: string;
      winHomeId: string;
      winAwayId: string;
      winHome: number | null;
      winAway: number | null;
      winLocked: boolean;
    }>;
  }) {
    let acc = this.matches.get(row.matchId);
    if (!acc) {
      acc = {
        matchId: row.matchId,
        gameId: row.gameId,
        homeId: row.home.id,
        homeName: row.home.name,
        awayId: row.away.id,
        awayName: row.away.name,
        startTime: row.startTime,
        bets: new Map(),
      };
      this.matches.set(row.matchId, acc);
    } else {
      acc.gameId = row.gameId;
      acc.homeId = row.home.id;
      acc.homeName = row.home.name;
      acc.awayId = row.away.id;
      acc.awayName = row.away.name;
      acc.startTime = row.startTime;
    }

    const odds = useOddsStore();
    for (const stage of row.stages) {
      if (stage.winHome != null) {
        odds.save(this.platform, {
          id: stage.winHomeId,
          odds: stage.winHome,
          isLock: stage.winLocked,
          betId: stage.winMarketId,
          time: Date.now(),
        });
      }
      if (stage.winAway != null) {
        odds.save(this.platform, {
          id: stage.winAwayId,
          odds: stage.winAway,
          isLock: stage.winLocked,
          betId: stage.winMarketId,
          time: Date.now(),
        });
      }
      acc.bets.set(stage.winMarketId, {
        Type: this.platform,
        SourceMatchID: row.matchId,
        SourceBetID: stage.winMarketId,
        Map: stage.stageId,
        BetName: stage.betName,
        SourceHomeID: stage.winHomeId,
        HomeName: row.home.name,
        HomeOdds: stage.winHome ?? 0,
        SourceAwayID: stage.winAwayId,
        AwayName: row.away.name,
        AwayOdds: stage.winAway ?? 0,
        Status: stage.winLocked ? "Locked" : "Normal",
      });
    }
  }
}
