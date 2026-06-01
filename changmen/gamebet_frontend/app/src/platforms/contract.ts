import type { PlatformId } from "@/types/esport";
import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";

export interface AccountBalanceResult {
  balance: number;
  currency?: string;
}

/** 对齐 A8 场馆订单 `Yt.*` 状态 */
export type VenueOrderStatus = "none" | "pending" | "reject" | "return" | "win" | "lose";

export interface VenueOrder {
  provider: PlatformId;
  orderId: string;
  odds: number;
  createAt: number;
  betMoney: number;
  reward: number;
  money: number;
  status: VenueOrderStatus;
  game: string;
  match: string;
  bet: string;
  item: string;
}

export interface PlatformProvider {
  getBalance?(account: PlatformAccount): Promise<AccountBalanceResult>;
  getOrders?(account: PlatformAccount): Promise<VenueOrder[]>;
  checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption>;
  betting(account: PlatformAccount, option: BetOption): Promise<BetResult>;
}

type StopFn = () => void;
export type CollectorFactory = () => StopFn;

export interface PlatformAdapter {
  id: PlatformId;
  collector?: CollectorFactory;
  provider?: PlatformProvider;
}
