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

/** 对齐 A8 `isVenueReject`：拒单检测取列表首条，须保证最新单在前 */
export function sortVenueOrdersNewestFirst(orders: VenueOrder[]): VenueOrder[] {
  return [...orders].sort((a, b) => b.createAt - a.createAt || b.orderId.localeCompare(a.orderId));
}

export interface PlatformProvider {
  getBalance?(account: PlatformAccount): Promise<AccountBalanceResult | undefined>;
  getOrders?(account: PlatformAccount): Promise<VenueOrder[]>;
  checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption>;
  betting(account: PlatformAccount, option: BetOption): Promise<BetResult>;
}

type StopFn = () => void;
export type CollectorFactory = () => StopFn;

export type CollectionMode =
  | "http_mqtt"
  | "http_ws"
  | "http_poll"
  | "aggregator_ws"
  | "parse_ws"
  | "plugin_http"
  | "plugin_graphql_ws"
  | "none";

/** 平台能力元数据（与 registry/manifest.json 对齐） */
export interface PlatformAdapterMeta {
  id: PlatformId;
  /** 目录名，小写：ob、xbet */
  dir: string;
  sort: number;
  collect: boolean;
  bet: boolean;
  pluginOnly?: boolean;
  a8Channel?: boolean;
  collectionMode: CollectionMode;
  saveMatchIntervalMs?: number;
}

export interface PlatformAdapter {
  id: PlatformId;
  meta?: PlatformAdapterMeta;
  collector?: CollectorFactory;
  provider?: PlatformProvider;
}
