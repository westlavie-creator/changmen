import type { PlatformId } from "@changmen/client-core/types/esport";

export type {
  LoseOrderCancelledRecord,
  LoseOrderRecord,
  MakeupRuntimePhase,
  OrderStatus,
} from "@changmen/client-core/types/order";

/** 订单列表/UI 用 OrderRow（含 [changmen 扩展] PM 字段） */
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
  Status?: import("@changmen/client-core/types/order").OrderStatus;
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
  /**
   * [changmen 扩展] 市场赛果（持有到期）：Win/Lose。
   * 与 Status/Money 脱钩；中途卖出仍可有值。
   */
  PmMatchResult?: "Win" | "Lose";
  /** [changmen 扩展] PredictFun 1:1 买卖 */
  PfSide?: "buy" | "sell";
  PfBuyOrderId?: string;
  PfSellState?: "open" | "closed";
  PfShares?: number;
  PfTokenId?: string;
  PfMarketId?: string;
  PfSellOrderId?: string;
  PfSellProceeds?: number;
  PfFeeAmountWei?: string;
  PfFeeType?: "COLLATERAL" | "SHARES";
  PfFeeUsdt?: number;
  PfFeeRateBps?: number;
}

export interface OrderPlayerInfo {
  Platform?: string;
  UserName?: string;
  Status?: import("@changmen/client-core/types/order").OrderStatus;
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
