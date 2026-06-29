import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { BetRowDto, ClientMatchDto, PlatformId, PmSportSnapshot } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { buildOrderOptions } from "@/domain/betting";
import { PLATFORMS } from "@/shared/platform";
import { readVenueOdds } from "@/services/oddsAccess";

export type BetSide = "Home" | "Away";

export class ViewBetItem {
  type: PlatformId;
  matchId: string;
  betId: string;
  homeId: string;
  awayId: string;
  /** GetMatchs Sources.Status；matcher 聚合 SaveBet 锁盘时 fo 可能滞后 */
  sourceStatus: string;
  fallbackHomeOdds: number;
  fallbackAwayOdds: number;

  constructor(source: BetRowDto["Sources"][string], providerMatchId: string) {
    this.type = source.Type;
    this.matchId = providerMatchId;
    this.betId = source.BetID;
    this.homeId = source.HomeID;
    this.awayId = source.AwayID;
    this.sourceStatus = String(source.Status ?? "Normal");
    // 对齐 A8 `FQ`：仅 HG 用 GetMatchs 快照作 fo fallback 初值；其余平台只信 fo
    if (source.Type === PLATFORMS.HG) {
      this.fallbackHomeOdds = Number(source.HomeOdds) || 0;
      this.fallbackAwayOdds = Number(source.AwayOdds) || 0;
    }
    else {
      this.fallbackHomeOdds = 0;
      this.fallbackAwayOdds = 0;
    }
  }

  getItemId(side: BetSide) {
    return side === "Home" ? this.homeId : this.awayId;
  }

  getOdds(side: BetSide) {
    // [A8 可证实] FQ 展示只经 updateOdds → fo.getOdds，不读 GetMatchs Sources.Status
    const fallback = side === "Home" ? this.fallbackHomeOdds : this.fallbackAwayOdds;
    return readVenueOdds(this.type, this.getItemId(side), fallback);
  }

  /** 对齐 A8 `FQ.updateOdds`：把 fo 当前值写回 fallback，供 maxOdds 等使用 */
  updateOdds() {
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
  initialHomeOdds: number;
  initialAwayOdds: number;
  isLive?: boolean;
  startTime?: number;

  constructor(row: BetRowDto, providers: Record<string, string | number>, liveRound: number, roundStart: number) {
    this.id = row.ID;
    this.homeName = row.HomeName;
    this.awayName = row.AwayName;
    this.name = row.Name;
    this.round = row.Map;
    this.initialHomeOdds = Number(row.InitialHomeOdds) || 0;
    this.initialAwayOdds = Number(row.InitialAwayOdds) || 0;
    if (liveRound !== 0 && liveRound === this.round) {
      this.isLive = true;
      this.startTime = roundStart > 0 ? roundStart : Date.now();
    }
    this.items = Object.values(row.Sources).map(
      s => new ViewBetItem(s, String(providers[s.Type] ?? "")),
    );
  }

  getBetName(): string {
    if (this.round === -1)
      return this.name ?? "";
    if (this.round === 0)
      return "全场胜负";
    return `[地图${this.round}] 获胜`;
  }

  maxOdds(side: BetSide): number {
    const fallbackKey = side === "Home" ? "fallbackHomeOdds" : "fallbackAwayOdds";
    let max = 0;
    for (const item of this.items) {
      const v = item[fallbackKey];
      if (v > max)
        max = v;
    }
    return max;
  }

  /** 对齐 A8 `IQ.GetOrderOptions(e,r,n)`：`providerKeys` = `Io().getProviders()` keys */
  getOrderOptions(
    match: ViewMatch,
    config: UserConfig,
    accounts: PlatformAccount[] = [],
    providerKeys: PlatformId[],
  ): BetOption[] | undefined {
    return buildOrderOptions(this, match, config, accounts, providerKeys);
  }

  /** [A8 可证实] bundle `IQ.isBet` 为空实现；noSame 场管在 getAccount 排除列表处理 */
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
  /** 当前局（来自 Client_GetMatchs Round，对齐 A8 赛事 dto） */
  liveRound: number;
  /** 当前局开赛时间戳 ms（RoundStart） */
  liveRoundStart: number;
  reverse: PlatformId[];
  providers: Record<string, string | number>;
  bets: ViewBet[];
  /** Polymarket Sports WS 赛程快照（VPS 写入） */
  pmSport?: PmSportSnapshot;

  constructor(dto: ClientMatchDto) {
    this.id = dto.ID;
    this.title = dto.Title;
    this.game = dto.Game;
    this.gameId = dto.GameID;
    this.bo = Number(dto.BO) || 0;
    this.startAt = normalizeEpochMs(dto.StartTime);
    this.reverse = dto.Reverse ?? [];
    this.providers = dto.Matchs ?? {};
    this.liveRound = dto.Round ?? 0;
    this.liveRoundStart = dto.RoundStart ?? 0;
    this.pmSport = dto.PmSport;
    this.bets = (dto.Bets ?? [])
      .map(b => new ViewBet(b, this.providers, this.liveRound, this.liveRoundStart))
      .sort((a, b) => a.round - b.round);
  }
}

export function toViewMatches(list: ClientMatchDto[]): ViewMatch[] {
  return list.map(m => new ViewMatch(m));
}
