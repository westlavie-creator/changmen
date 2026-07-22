/** Predict.fun 语义 API → changmen esport（VPS house 代下） */

import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { VenueOrder } from "../contract";
import { changmenPmEsportCall } from "@changmen/client-core/shared/platformHttp";

function requirePlayerId(account: PlatformAccount): number {
  const id = account.accountId;
  if (id == null || !Number(id))
    throw new Error("PredictFun 账号未保存（无 playerId）");
  return Number(id);
}

export interface PfCheckBetRequest {
  marketId: string;
  tokenId: string;
  apiBetMoney: number;
  detectionMaxPrice: number;
  detectionOdds?: number;
  slippageBps?: string | number;
  /** 侧栏可读文案（对齐 PM Match/Bet/Item） */
  match?: string;
  bet?: string;
  item?: string;
}

export interface PfCheckBetResult {
  tokenId: string;
  marketId: string;
  apiBetMoney: number;
  detectionOdds: number;
  detectionMaxPrice: number;
  bookPrice: number;
  bookOdds: number;
  bookFetchedAt: number;
  feeRateBps: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  side: "BUY";
  playerId: number;
}

export interface PfSubmitOrderResult {
  orderId: string;
  code?: string | null;
  bookPrice: number;
  bookOdds: number;
  playerId: number;
  pending?: boolean;
  balance?: number;
  totalProfit?: number;
}

export type PfOrderSettlement = "filled" | "unfilled" | "timeout";

export interface PfGetOrderResult {
  orderId: string;
  found: boolean;
  settlement: PfOrderSettlement;
  order: VenueOrder | null;
  refunded?: boolean;
}

export interface PfGetOrdersResult {
  orders: VenueOrder[];
  refundedCount?: number;
  settledCount?: number;
  playerId: number;
}

export interface PfSettleOpenOrdersResult {
  settled: number;
  wins: number;
  losses: number;
  balanceDelta?: number;
  balance?: number;
  totalProfit?: number;
  unsettle?: number;
  playerId: number;
}

type PfAction =
  | "Pf_CheckBet"
  | "Pf_SubmitOrder"
  | "Pf_SubmitSell"
  | "Pf_GetOrder"
  | "Pf_GetOrders"
  | "Pf_RefreshBalance"
  | "Pf_SettleOpenOrders"
  | "Pf_HouseRedeemResolved";

/** house 下单/卖出含签名+上游+RDS，常超过 a8Axios 默认 15s */
const PF_SLOW_ACTIONS = new Set<PfAction>([
  "Pf_SubmitOrder",
  "Pf_SubmitSell",
  "Pf_CheckBet",
]);
const PF_SLOW_TIMEOUT_MS = 60_000;

/** 复用 esport POST 通道（与 Pm_* 相同鉴权头） */
async function pfEsportCall<T>(
  action: PfAction,
  body: Record<string, unknown>,
): Promise<T> {
  try {
    return await changmenPmEsportCall<T>(
      action,
      body,
      PF_SLOW_ACTIONS.has(action) ? { timeoutMs: PF_SLOW_TIMEOUT_MS } : undefined,
    );
  }
  catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(raw.replace(/^PM API 不可用/, "PF API 不可用"));
  }
}

export async function pfCheckBet(
  account: PlatformAccount,
  req: PfCheckBetRequest,
): Promise<PfCheckBetResult> {
  return pfEsportCall<PfCheckBetResult>("Pf_CheckBet", {
    playerId: requirePlayerId(account),
    marketId: req.marketId,
    tokenId: req.tokenId,
    apiBetMoney: req.apiBetMoney,
    detectionMaxPrice: req.detectionMaxPrice,
    detectionOdds: req.detectionOdds,
    slippageBps: req.slippageBps,
  });
}

export async function pfSubmitOrder(
  account: PlatformAccount,
  req: PfCheckBetRequest,
): Promise<PfSubmitOrderResult> {
  return pfEsportCall<PfSubmitOrderResult>("Pf_SubmitOrder", {
    playerId: requirePlayerId(account),
    marketId: req.marketId,
    tokenId: req.tokenId,
    apiBetMoney: req.apiBetMoney,
    detectionMaxPrice: req.detectionMaxPrice,
    detectionOdds: req.detectionOdds,
    slippageBps: req.slippageBps,
    match: req.match,
    bet: req.bet,
    item: req.item,
  });
}

export interface PfSubmitSellResult {
  buyOrderId: string;
  sellOrderId: string;
  shares: number;
  proceedsUsdt: number;
  profit: number;
  bookPrice?: number;
  bookOdds?: number;
  balance?: number;
  totalProfit?: number;
  playerId: number;
}

/** 1:1 全卖指定买单 */
export async function pfSubmitSell(
  account: PlatformAccount,
  buyOrderId: string,
): Promise<PfSubmitSellResult> {
  return pfEsportCall<PfSubmitSellResult>("Pf_SubmitSell", {
    playerId: requirePlayerId(account),
    buyOrderId: String(buyOrderId ?? "").trim(),
  });
}

export async function pfGetOrder(
  account: PlatformAccount,
  orderId: string,
): Promise<PfGetOrderResult> {
  return pfEsportCall<PfGetOrderResult>("Pf_GetOrder", {
    playerId: requirePlayerId(account),
    orderId: String(orderId ?? "").trim(),
  });
}

export async function pfGetOrders(account: PlatformAccount): Promise<VenueOrder[]> {
  const info = await pfEsportCall<PfGetOrdersResult>("Pf_GetOrders", {
    playerId: requirePlayerId(account),
  });
  return Array.isArray(info?.orders) ? info.orders : [];
}

/** 主动结算已 RESOLVED 的未结单（也可由 RefreshBalance / GetOrders 顺带触发） */
export async function pfSettleOpenOrders(
  account: PlatformAccount,
): Promise<PfSettleOpenOrdersResult> {
  return pfEsportCall<PfSettleOpenOrdersResult>("Pf_SettleOpenOrders", {
    playerId: requirePlayerId(account),
  });
}

/** 管理员：主号 redeem 已 RESOLVED 仓位 */
export async function pfHouseRedeemResolved(opts?: {
  marketId?: string | number;
  force?: boolean;
}): Promise<{ redeemed: number; failed: number; marketId?: string; skipped?: boolean }> {
  return pfEsportCall("Pf_HouseRedeemResolved", {
    marketId: opts?.marketId,
    force: opts?.force,
  });
}
