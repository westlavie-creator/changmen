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
  /** CLOB trade.price / 成交概率价（0–1） */
  PmFillPrice?: number;
  PmStakeUsdc?: number;
  PmConditionId?: string;
  /** changmen 站内下单；官网同步为 external */
  PmOrigin?: "changmen" | "external";
  PmAttributedSellShares?: number;
  PmRealizedPnlUsdc?: number;
  PmSellState?: "open" | "partial" | "closed" | "settled";
  /** buy=买入；sell=平仓 */
  PmSide?: "buy" | "sell";
  /** 卖单对应买单 orderId */
  PmBuyOrderId?: string;
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
  /** [changmen 扩展] PM jb：timeout 后续轮 settle，避免重复 POST */
  pendingPmOrderId?: string;
  pendingPmAccountId?: number;
  /** [changmen 扩展] 侧栏补单行运行时阶段（刷新后 placing/settling 会清空） */
  runtimePhase?: MakeupRuntimePhase;
}

/** [changmen 扩展] 补单队列项在订单列表中的运行时阶段 */
export type MakeupRuntimePhase
  = | "placing"
    | "settling"
    | "pm_pending"
    | "rejected_retry";

/** [changmen 扩展] 用户手动取消的补单，侧栏 Link 组内保留展示 */
export interface LoseOrderCancelledRecord {
  betId: number;
  linkId: number;
  match: string;
  bet: string;
  target: "Home" | "Away";
  createAt: number;
  cancelledAt: number;
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
