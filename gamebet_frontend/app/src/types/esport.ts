/** 对齐 gamebet_backend/core/esport-api router 通用响应 */
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
  refreshToken?: string;
  userName: string;
  ID: number;
}

export interface UserInfo {
  ID: number;
  UserName: string;
  Setting: Record<string, unknown>;
  /** 平博信用盘 v4 登录用 A8 账号（可能与 UserName 不同，如本地 admin） */
  CreditPlateUserName?: string;
}

export interface ObGameOddTypeSpec {
  full: string;
  map: string;
}

export interface CollectPlatformInfo {
  Gateway: string;
  Token: string;
  BetName: string;
  /** OB 各游戏主盘 odd_type_id（平台 game_id → full/map） */
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
  Sources: Record<string, BetSourceDto>;
}

export interface ClientMatchDto {
  ID: number;
  Title: string;
  Game: string;
  GameID: number;
  StartTime: number;
  /** OB 等平台的 BO 局数，用于拉取各 stage 的 game/view */
  BO?: number;
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
  /** A8 `Client_GetMoneyLogs` 全量列表，用于统计 */
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
