import type { PlatformId } from "@/types/esport";

/** 对齐 A8 `Yt` */
export type OrderStatus
  = | "Pending"
    | "None"
    | "Win"
    | "Lose"
    | "Return"
    | "Reject"
    | string;

export interface OrderPlayerInfo {
  Platform?: string;
  UserName?: string;
  Status?: OrderStatus;
}

export interface OrderRow {
  OrderID?: number | string;
  Link?: number;
  Type?: PlatformId | string;
  Match?: string;
  Bet?: string;
  Item?: string;
  Odds?: number;
  BetMoney?: number;
  Money?: number;
  Status?: OrderStatus;
  CreateAt?: number;
  PlayerID?: number;
  Player?: OrderPlayerInfo;
  /** [changmen 扩展] Polymarket 持仓，来自 orders.raw */
  PmTokenId?: string;
  PmShares?: number;
  PmStakeUsdc?: number;
}

export interface LoseOrderRecord {
  accountId: number;
  matchId: number;
  betId: number;
  target: "Home" | "Away";
  betMoney: number;
  betOdds: number;
  match: string;
  bet: string;
  linkId: number;
  createAt: number;
  isCreateOrder: boolean;
  betCount: number;
}

export interface FollowOrderInput {
  isOpen?: boolean;
  betMoney?: number;
  minMoney?: number;
  maxMoney?: number;
  odds?: number;
  publishers?: number[];
}

/** Follow KV 完整配置（对齐 bundle `FollowView` 的 users 字段） */
export interface FollowConfig {
  isOpen: boolean;
  betMoney: number;
  minMoney?: number;
  maxMoney?: number;
  odds: number;
  /** bundle 原字段 */
  users?: number[];
  /** 兼容旧字段 */
  publishers?: number[];
}
