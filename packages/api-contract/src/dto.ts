import type { ApiEnvelope } from "./envelope.js";

export type { ApiEnvelope };

export type PlatformId
  = | "OB"
    | "RAY"
    | "TF"
    | "IA"
    | "SABA"
    | "PB"
    | "IM"
    | "IMT"
    | "HG"
    | "Stake"
    | "XBet"
    | "Dex"
    | "Polymarket";

export interface LoginInfo {
  token: string;
  refreshToken?: string;
  userName: string;
  ID: number;
}

export interface UserInfo {
  ID: number;
  UserName: string;
  Setting: Record<string, unknown>;
  CreditPlateUserName?: string;
  IsAdmin?: boolean | 0 | 1;
  Role?: "admin" | "leader" | "user";
  TeamId?: string | null;
}

export interface ObGameOddTypeSpec {
  full: string;
  map: string;
}

export interface CollectPlatformInfo {
  Gateway: string;
  Token: string;
  BetName: string;
  GameOddTypes?: Record<string, ObGameOddTypeSpec>;
}

export interface BetSourceDto {
  Type: PlatformId;
  BetID: string;
  HomeID: string;
  AwayID: string;
  HomeOdds: number;
  AwayOdds: number;
  Status?: string;
}

export interface BetRowDto {
  ID: number;
  MatchID: number;
  Map: number;
  Name: string;
  HomeID: number;
  HomeName: string;
  AwayID: number;
  AwayName: string;
  Status?: string;
  /** matcher 进行中 OB 无 Map=0 时保留，供 Web 初赔行 */
  InitialHomeOdds?: number;
  InitialAwayOdds?: number;
  Sources: Record<string, BetSourceDto>;
}

export interface PmSportMapResult {
  map: number;
  winner: "home" | "away" | string;
  winnerName?: string;
}

/** Polymarket Sports WS 快照（client_matches.pm_sport） */
export interface PmSportSnapshot {
  gameId?: number;
  slug?: string;
  leagueAbbreviation?: string;
  homeTeam?: string;
  awayTeam?: string;
  status?: string;
  live?: boolean;
  ended?: boolean;
  period?: string;
  currentMap?: number | null;
  bo?: number;
  scoreRaw?: string;
  mapScore?: { home: number; away: number };
  /** @deprecated 旧快照可能仍有；新写入不再包含 */
  inMapScore?: string | null;
  /** @deprecated 旧快照可能仍有；新写入不再包含 */
  maps?: PmSportMapResult[];
  elapsed?: string;
  finishedTimestamp?: string;
  /** 赛果/直播来源 URL（Gamma resolutionSource） */
  resolutionSource?: string;
  label?: string;
  updatedAt?: number;
}

export interface ClientMatchDto {
  ID: number;
  Title: string;
  Game: string;
  GameID: number;
  StartTime: number;
  BO?: number;
  Round?: number;
  RoundStart?: number;
  Reverse?: PlatformId[];
  Matchs: Record<string, string | number>;
  Bets: BetRowDto[];
  PmSport?: PmSportSnapshot;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
  data?: T[];
  RecordCount?: number;
}

export interface OrderRow {
  OrderID?: number;
  Link?: number;
  Type?: PlatformId;
  Match?: string;
  Bet?: string;
  Item?: string;
  Odds?: number;
  BetMoney?: number;
  Money?: number;
  Status?: string;
  CreateAt?: number;
  PlayerID?: number;
  Player?: { Platform?: string; UserName?: string; Status?: string };
}

export interface MoneyLogRow {
  logId?: number;
  ID?: number;
  Id?: number;
  playerId?: number;
  PlayerID?: number;
  Money?: number;
  money?: number;
  Type?: string;
  type?: string;
  Currency?: string;
  currency?: string;
  Description?: string;
  description?: string;
  Remark?: string;
  IsAuto?: number;
  isAuto?: number;
  CreateAt?: number;
  createAt?: number;
}

export interface UserProfitRow {
  UserID: number;
  UserName: string;
  Money: number;
  Count?: number;
  BetMoney?: number;
  Date?: string;
}

export interface TagPlatformRow {
  ID?: number;
  Id?: number;
  Name?: string;
  Platform?: string;
}

export interface PlayerOrderRow {
  OrderID?: number;
  PlayerID?: number;
  Match?: string;
  Bet?: string;
  Odds?: number;
  BetMoney?: number;
  Status?: string;
}

export interface UserListRow {
  Id?: number;
  UserID?: number;
  userId?: number;
  UserName?: string;
  userName?: string;
  isOnline?: number;
  Setting?: Record<string, unknown>;
}

export interface ChatMessageRow {
  ID?: number;
  Id?: number;
  User?: string;
  Content?: string;
  Time?: number;
  content?: string;
  UserName?: string;
  userName?: string;
  CreateAt?: number;
}
