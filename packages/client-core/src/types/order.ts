import type { BetSide } from "../models/match";

/** 对齐 A8 bundle `eb` 持久化形状 */
export interface LoseOrderRecord {
  accountId: number;
  matchId: number;
  betId: number;
  target: BetSide;
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
  target: BetSide;
  createAt: number;
  cancelledAt: number;
}

/** 对齐 A8 `Yt` */
export type OrderStatus
  = | "Pending"
    | "None"
    | "Win"
    | "Lose"
    | "Return"
    | "Reject"
    | string;
