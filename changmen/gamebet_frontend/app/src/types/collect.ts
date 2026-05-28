import type { PlatformId } from "@/types/esport";

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
}

export interface CollectBetDto {
  Type: PlatformId;
  SourceMatchID: string | number;
  SourceBetID: string | number;
  /** OB 主盘 odd_type_id，供后端去重与 catalog 对齐 */
  OddTypeID?: string;
  Map: number;
  BetName: string;
  GroupName?: string;
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
