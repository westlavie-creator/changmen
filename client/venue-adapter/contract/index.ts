import type { PlatformId } from "@changmen/api-contract";
import type { BetOption } from "@changmen/client-core/models/betOption";
import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

export interface AccountBalanceResult {
  balance: number;
  currency?: string;
}

/** 对齐 A8 场馆订单 `Yt.*` 状态 */
export type VenueOrderStatus = "none" | "pending" | "reject" | "return" | "win" | "lose";

/** [changmen 扩展] Polymarket 持仓；其它场馆 getOrders 不填 */
export type PolymarketOrderOrigin = "changmen" | "external";

/** 逻辑持仓：changmen 按行卖出归因 */
export type PolymarketSellState = "open" | "partial" | "closed" | "settled";

/** 买单 vs 平仓卖单（各一条 VenueOrder） */
export type PolymarketOrderSide = "buy" | "sell";

export interface PolymarketVenueOrderExtras {
  pmTokenId?: string;
  pmShares?: number;
  /** CLOB trade.price / POST 成交概率价（0–1） */
  pmFillPrice?: number;
  pmStakeUsdc?: number;
  /** CLOB condition_id，User WS 订阅与卖出 delayed 检测 */
  pmConditionId?: string;
  /** changmen 站内下单 vs 官网同步 */
  pmOrigin?: PolymarketOrderOrigin;
  /** 本行 changmen 卖出累计份数 */
  pmAttributedSellShares?: number;
  pmRealizedPnlUsdc?: number;
  pmSellState?: PolymarketSellState;
  /** buy=买入持仓；sell=平仓成交 */
  pmSide?: PolymarketOrderSide;
  /** 卖单对应买单 orderId */
  pmBuyOrderId?: string;
}

export interface VenueOrder extends PolymarketVenueOrderExtras {
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

/**
 * 订单状态层结论（POST/API 受理之后）。
 * - filled：最终成交
 * - unfilled：拒单 / FOK 未成交
 * - timeout：待确认超时（jb 可续查；套利侧按拒单处理）
 */
export type VenueLegSettlement = "filled" | "unfilled" | "timeout";

export interface VenueLegOutcome {
  orders: VenueOrder[];
  settlement: VenueLegSettlement;
}

export function isVenueLegRejected(outcome: VenueLegOutcome): boolean {
  return outcome.settlement !== "filled";
}

export function isVenueLegPendingConfirm(outcome: VenueLegOutcome): boolean {
  return outcome.settlement === "timeout";
}

export interface ResolveLegOutcomeOpts {
  /** PM：轮询 settle / trades；false 时仅按 getOrders + orderId 判拒 */
  confirmPmPost?: boolean;
  /** 编排层已拉取的订单列表，避免重复 getOrders */
  orders?: VenueOrder[];
  /** 编排层拉单回调（含 saveOrders）；PM settle 后刷新用 */
  fetchVenueOrders?: () => Promise<VenueOrder[]>;
}

export interface PlatformProvider {
  getBalance?(account: PlatformAccount): Promise<AccountBalanceResult | undefined>;
  getOrders?(account: PlatformAccount): Promise<VenueOrder[]>;
  checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption>;
  betting(account: PlatformAccount, option: BetOption): Promise<BetResult>;
  /** 订单状态层：POST 之后判定 filled / unfilled / timeout（拒单检测） */
  resolveLegOutcome?(
    account: PlatformAccount,
    result?: BetResult,
    opts?: ResolveLegOutcomeOpts,
  ): Promise<VenueLegOutcome>;
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
