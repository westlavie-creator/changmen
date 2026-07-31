import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet } from "./transport";

/** CLOB `/clob-markets/{id}` 的 fee 曲线参数 */
export interface PolymarketMarketFeeDetails {
  /** 平台 feeRate（文档 `fd.r`） */
  feeRate: number;
  /** 曲线指数（文档 `fd.e`；公开主公式按 p×(1−p)，e 仅保留） */
  exponent: number;
  /** 是否仅 taker 收费 */
  takerOnly: boolean;
}

const FEE_CACHE_TTL_MS = 5 * 60_000;
const feeCache = new Map<string, { details: PolymarketMarketFeeDetails; expiresAt: number }>();

function round5(n: number): number {
  if (!Number.isFinite(n) || n <= 0)
    return 0;
  const rounded = Math.round(n * 100_000) / 100_000;
  // 官方：小于 0.00001 当 0
  return rounded < 0.00001 ? 0 : rounded;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 解析 `/clob-markets` 的 `fd` */
export function parsePolymarketMarketFeeDetails(
  row: { fd?: { r?: unknown; e?: unknown; to?: unknown } | null } | null | undefined,
): PolymarketMarketFeeDetails {
  const fd = row?.fd;
  const feeRate = Number(fd?.r);
  const exponent = Number(fd?.e);
  return {
    feeRate: Number.isFinite(feeRate) && feeRate > 0 ? feeRate : 0,
    exponent: Number.isFinite(exponent) && exponent > 0 ? exponent : 1,
    takerOnly: fd?.to !== false,
  };
}

/**
 * 平台 taker fee（USDC）。
 * 文档主公式：`fee = C × feeRate × p × (1 − p)`，保留 5 位小数。
 * Maker 或不收费盘 → 0。
 */
export function computePolymarketPlatformFeeUsdc(params: {
  shares: number;
  price: number;
  feeRate: number;
  /** 预留；公开表与主公式一致时按 p×(1−p)，不升幂 */
  exponent?: number;
  takerOnly?: boolean;
  isTaker?: boolean;
}): number {
  const shares = Number(params.shares);
  const price = Number(params.price);
  const feeRate = Number(params.feeRate);
  const isTaker = params.isTaker !== false;
  const takerOnly = params.takerOnly !== false;
  if (!(shares > 0) || !(price > 0 && price < 1) || !(feeRate > 0))
    return 0;
  if (takerOnly && !isTaker)
    return 0;
  // 主公式（对齐 docs/trading/fees）；exponent≠1 的市场若官方另有曲线再迭代
  const fee = shares * feeRate * price * (1 - price);
  return round5(fee);
}

/** Builder taker 扁平费率（bps）；当前下单预填 0，预留叠加 */
export function computePolymarketBuilderFeeUsdc(notionalUsdc: number, takerBps: number): number {
  const notional = Number(notionalUsdc);
  const bps = Number(takerBps);
  if (!(notional > 0) || !(bps > 0))
    return 0;
  return round5(notional * bps / 10_000);
}

/**
 * 买单全成本：名义 G + 平台 fee（+ 可选 builder）。
 * 买入价仍用 G/C；本函数只动金额。
 */
export function computePolymarketBuyAllInStakeUsdc(params: {
  grossStakeUsdc: number;
  shares: number;
  feeRate?: number;
  exponent?: number;
  takerOnly?: boolean;
  isTaker?: boolean;
  builderTakerBps?: number;
  /** 若已算好 fee，直接用 */
  feeUsdc?: number;
}): { feeUsdc: number; allInStakeUsdc: number; fillPrice: number } {
  const gross = round4(Number(params.grossStakeUsdc) || 0);
  const shares = Number(params.shares) || 0;
  const fillPrice = shares > 0 && gross > 0 ? gross / shares : 0;
  let feeUsdc = Number(params.feeUsdc);
  if (!Number.isFinite(feeUsdc) || feeUsdc < 0) {
    feeUsdc = computePolymarketPlatformFeeUsdc({
      shares,
      price: fillPrice,
      feeRate: Number(params.feeRate) || 0,
      exponent: params.exponent,
      takerOnly: params.takerOnly,
      isTaker: params.isTaker,
    });
    feeUsdc = round4(
      feeUsdc + computePolymarketBuilderFeeUsdc(gross, Number(params.builderTakerBps) || 0),
    );
  }
  else {
    feeUsdc = round4(feeUsdc);
  }
  return {
    feeUsdc,
    allInStakeUsdc: round4(gross + feeUsdc),
    fillPrice,
  };
}

/** 拉取并缓存市场 fee 参数；失败视为 0 费率（并打日志，避免静默漏记） */
export async function fetchPolymarketMarketFeeDetails(
  conditionId: string,
): Promise<PolymarketMarketFeeDetails> {
  const id = String(conditionId ?? "").trim();
  const empty: PolymarketMarketFeeDetails = { feeRate: 0, exponent: 1, takerOnly: true };
  if (!id)
    return empty;

  const now = Date.now();
  const hit = feeCache.get(id);
  if (hit && hit.expiresAt > now)
    return hit.details;

  try {
    const row = await polymarketPluginGet<{ fd?: { r?: unknown; e?: unknown; to?: unknown } }>(
      `${POLYMARKET_CLOB_API}/clob-markets/${id}`,
    );
    const details = parsePolymarketMarketFeeDetails(row);
    feeCache.set(id, { details, expiresAt: now + FEE_CACHE_TTL_MS });
    return details;
  }
  catch (err) {
    console.warn(
      "[Polymarket] 拉取市场手续费参数失败，本单暂按 0 费率",
      id.slice(0, 18),
      err instanceof Error ? err.message : err,
    );
    return empty;
  }
}

/** 单测 / 登出：清 fee 缓存 */
export function clearPolymarketMarketFeeCache(): void {
  feeCache.clear();
}

/**
 * 给尚未写入 pmFeeUsdc 的买单补手续费（USDC 口径，须在 scale→CNY 之前调用）。
 * 名义成本始终用 份额×买入价，避免把已含费的 pmStakeUsdc 再加一遍 fee。
 * 已开始卖出/已结清的单不再改 stake（否则会冲掉剩余敞口）。
 */
export async function enrichPolymarketBuyVenueOrderWithFee<T extends {
  pmSide?: string;
  pmFeeUsdc?: number;
  pmConditionId?: string;
  pmShares?: number;
  pmFillPrice?: number;
  pmStakeUsdc?: number;
  pmAttributedSellShares?: number;
  pmSellState?: string;
  betMoney?: number;
  odds?: number;
  reward?: number;
}>(order: T): Promise<T> {
  if (String(order.pmSide ?? "buy").toLowerCase() === "sell")
    return order;
  if (Number(order.pmFeeUsdc) > 0)
    return order;
  const sellState = String(order.pmSellState ?? "").toLowerCase();
  const attributed = Number(order.pmAttributedSellShares) || 0;
  // 部分卖/已卖光/已结算：剩余 pmStakeUsdc 已被扣减，禁止用「满仓 all-in」覆盖
  if (
    attributed > 0.0001
    || sellState === "partial"
    || sellState === "closed"
    || sellState === "settled"
  ) {
    return order;
  }
  const conditionId = String(order.pmConditionId ?? "").trim();
  if (!conditionId)
    return order;

  const shares = Number(order.pmShares) || 0;
  const fillPrice = Number(order.pmFillPrice) || 0;
  const gross = (shares > 0.0001 && fillPrice > 0 && fillPrice < 1)
    ? round4(shares * fillPrice)
    : round4(Number(order.pmStakeUsdc) || Number(order.betMoney) || 0);
  if (!(gross > 0) || !(shares > 0))
    return order;

  const fd = await fetchPolymarketMarketFeeDetails(conditionId);
  const allIn = computePolymarketBuyAllInStakeUsdc({
    grossStakeUsdc: gross,
    shares,
    feeRate: fd.feeRate,
    exponent: fd.exponent,
    takerOnly: fd.takerOnly,
    isTaker: true,
  });
  if (!(allIn.feeUsdc > 0))
    return order;

  const odds = Number(order.odds) > 0
    ? Number(order.odds)
    : (fillPrice > 0 ? round4(1 / fillPrice) : 0);
  return {
    ...order,
    pmFeeUsdc: allIn.feeUsdc,
    pmStakeUsdc: allIn.allInStakeUsdc,
    betMoney: allIn.allInStakeUsdc,
    // 可得仍按名义
    reward: odds > 0 ? round4(gross * odds) : round4(shares),
  };
}

/** 批量补费；同 conditionId 走 fetch 缓存 */
export async function enrichPolymarketBuyOrdersWithFees<T extends {
  pmSide?: string;
  pmFeeUsdc?: number;
  pmConditionId?: string;
  pmShares?: number;
  pmFillPrice?: number;
  pmStakeUsdc?: number;
  betMoney?: number;
  odds?: number;
  reward?: number;
}>(orders: T[]): Promise<T[]> {
  if (!orders.length)
    return orders;
  return Promise.all(orders.map(o => enrichPolymarketBuyVenueOrderWithFee(o)));
}
