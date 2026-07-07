import type { PlatformId } from "@changmen/api-contract";

export interface CollectTeamDto {
  Type: PlatformId;
  TeamID: string | number;
  Name: string;
  GameID: string | number;
  Logo?: string;
}

export interface CollectMatchDto {
  Type: PlatformId;
  SourceMatchID: string | number;
  SourceGameID: string | number;
  StartTime: number;
  BO?: number;
  HomeID: string | number;
  Home: string;
  AwayID: string | number;
  Away: string;
  Teams: CollectTeamDto[];
  /** OB game/index 的 is_live：1 未开赛，2 进行中 */
  IsLive?: number;
}

export interface CollectBetDto {
  Type: PlatformId;
  SourceMatchID: string | number;
  SourceBetID: string | number;
  Map: number;
  BetName: string;
  SourceHomeID: string | number;
  HomeName: string;
  HomeOdds: number;
  SourceAwayID: string | number;
  AwayName: string;
  AwayOdds: number;
  Status: "Normal" | "Locked" | string;
}

export interface CollectConfigDto extends Record<string, unknown> {
  log: boolean;
  collect: [PlatformId, boolean][];
}
