import type { CollectBetDto, CollectMatchDto, CollectTeamDto } from "@/types/collect";

/** A8 Pinia `Af.saveMatch` → `saveMatchSource` 裁剪后的比赛行 [A8 可证实] */
export function toA8SaveMatchRow(m: CollectMatchDto) {
  return {
    SourceMatchID: m.SourceMatchID,
    SourceGameID: m.SourceGameID,
    Type: m.Type,
    StartTime: m.StartTime,
    HomeID: m.HomeID,
    Home: m.Home,
    AwayID: m.AwayID,
    Away: m.Away,
    Teams: m.Teams.map(toA8SaveTeamRow),
    BO: m.BO,
    ...(m.IsLive != null ? { IsLive: m.IsLive } : {}),
  };
}

function toA8SaveTeamRow(t: CollectTeamDto) {
  return {
    Type: t.Type,
    TeamID: t.TeamID,
    Name: t.Name,
    GameID: t.GameID,
    Logo: t.Logo ?? "",
  };
}

/** A8 SaveBet 固定 12 字段；采集器多带的 changmen 扩展（如 GroupName）在此剥掉 [A8 可证实] */
export function toA8SaveBetRow(b: CollectBetDto) {
  return {
    Type: b.Type,
    SourceMatchID: b.SourceMatchID,
    Map: b.Map,
    SourceBetID: b.SourceBetID,
    BetName: b.BetName,
    SourceHomeID: b.SourceHomeID,
    HomeName: b.HomeName,
    HomeOdds: b.HomeOdds,
    SourceAwayID: b.SourceAwayID,
    AwayName: b.AwayName,
    AwayOdds: b.AwayOdds,
    Status: b.Status,
  };
}

/** A8 OB `LMe` → `saveLiveTimer` 计时器元素 */
export function toA8LiveTimerRow(t: {
  MatchID: string | number;
  Round: number;
  StartTime: number;
}) {
  return {
    MatchID: t.MatchID,
    Round: t.Round,
    StartTime: t.StartTime,
  };
}
