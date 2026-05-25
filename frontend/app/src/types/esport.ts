/** 对齐 backend/esport-api router 通用响应 */
export interface ApiEnvelope<T = unknown> {
  success: 0 | 1;
  msg?: string;
  info?: T;
}

export type PlatformId =
  | "OB"
  | "RAY"
  | "TF"
  | "IA"
  | "SABA"
  | "PB"
  | "IM"
  | "IMT"
  | "HG"
  | "Stake"
  | "XBet";

export interface LoginInfo {
  token: string;
  userName: string;
  ID: number;
}

export interface UserInfo {
  ID: number;
  UserName: string;
  Setting: Record<string, unknown>;
}

export interface CollectPlatformInfo {
  Gateway: string;
  Token: string;
  BetName: string;
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
  Sources: Record<string, BetSourceDto>;
}

export interface ClientMatchDto {
  ID: number;
  Title: string;
  Game: string;
  GameID: number;
  StartTime: number;
  Round?: number;
  RoundStart?: number;
  Reverse?: PlatformId[];
  Matchs: Record<string, string | number>;
  Bets: BetRowDto[];
}

export interface PageResult<T> {
  list: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
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
  Id?: number;
  PlayerID?: number;
  Money?: number;
  Type?: string;
  CreateAt?: number;
  Remark?: string;
}

export interface UserProfitRow {
  UserID: number;
  UserName: string;
  Money: number;
  Count: number;
  BetMoney: number;
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
  UserName?: string;
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
