import type { OrderRow } from "@/types/order";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";
import { toFixed } from "@changmen/client-core/shared/format";
import { normalizeOrderStatus } from "@/shared/orderDisplay";

/** Polymarket API 数值：保留有效小数，去掉尾部 0 */
export function formatPolymarketApiDecimal(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value))
    return "";
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, "") || "0";
}

/** 侧栏展示的 PM 订单（买单 + changmen 卖单） */
export function isPmOrderListRow(row: OrderRow): boolean {
  return String(row.Type ?? "").trim() === "Polymarket";
}

export function isPmSellOrderListRow(row: OrderRow): boolean {
  return isPmOrderListRow(row) && row.PmSide === "sell";
}

export function isPmBuyOrderListRow(row: OrderRow): boolean {
  return isPmOrderListRow(row) && row.PmSide !== "sell";
}

/** 手动卖出（含部分卖 / settled 但已有卖出归因） */
export function isPmManuallySoldBuy(row: OrderRow): boolean {
  if (!isPmBuyOrderListRow(row))
    return false;
  const state = String(row.PmSellState ?? "").toLowerCase();
  if (state === "closed" || state === "partial")
    return true;
  const attr = Number(row.PmAttributedSellShares) || 0;
  return state === "settled" && attr > 0;
}

/** 赛果结算：settled 且无手动卖出归因 */
export function isPmMarketSettledBuy(row: OrderRow): boolean {
  if (!isPmBuyOrderListRow(row))
    return false;
  if (isPmManuallySoldBuy(row))
    return false;
  return String(row.PmSellState ?? "").toLowerCase() === "settled";
}

/** 侧栏买单生命周期小标签文案 */
export function pmBuyLifecycleTagText(row: OrderRow): string | null {
  if (isPmManuallySoldBuy(row)) {
    if (String(row.PmSellState ?? "").toLowerCase() === "partial")
      return "部分卖出";
    return "已卖出";
  }
  if (isPmMarketSettledBuy(row))
    return "已结算";
  return null;
}

/**
 * 侧栏角标 class：手动平仓后 RDS 仍为 Status=None（挡 Gamma），
 * 展示层把卖单按盈亏映成赢/输/退；手动卖光买单映成 PmSold。
 */
export function resolvePmOrderListStatusClass(row: OrderRow): string {
  if (!isPmOrderListRow(row))
    return String(normalizeOrderStatus(String(row.Status ?? "None")));

  const raw = String(normalizeOrderStatus(String(row.Status ?? "None")));
  if (raw !== "None" && raw !== "Pending")
    return raw;

  if (isPmSellOrderListRow(row)) {
    const bet = Number(row.BetMoney) || 0;
    const money = Number(row.Money) || 0;
    // 尚未成交回款：仍待结算（延迟成交等）
    if (bet <= 0 && money === 0)
      return "None";
    if (money > 0)
      return "Win";
    if (money < 0)
      return "Lose";
    return "Return";
  }

  if (isPmManuallySoldBuy(row) && String(row.PmSellState ?? "").toLowerCase() !== "partial")
    return "PmSold";
  if (isPmMarketSettledBuy(row))
    return "PmSettled";

  return raw;
}

export function pmOrderSharesText(row: OrderRow): string | null {
  const shares = Number(row.PmShares);
  if (!Number.isFinite(shares) || shares <= 0.0001)
    return null;
  return formatPolymarketApiDecimal(shares);
}

/** CLOB trade.price；旧单无字段时回退 stake÷shares */
export function resolvePmFillPrice(row: OrderRow): number | null {
  const stored = Number(row.PmFillPrice);
  if (Number.isFinite(stored) && stored > 0 && stored < 1)
    return stored;

  const shares = Number(row.PmShares);
  const stakeUsdc = Number(row.PmStakeUsdc);
  if (Number.isFinite(shares) && shares > 0.0001 && Number.isFinite(stakeUsdc) && stakeUsdc > 0) {
    const price = stakeUsdc / shares;
    if (price > 0 && price < 1)
      return price;
  }
  const odds = Number(row.Odds);
  if (Number.isFinite(odds) && odds > 1) {
    const price = 1 / odds;
    if (price > 0 && price < 1)
      return price;
  }
  return null;
}

export function pmOrderFillPriceText(row: OrderRow): string | null {
  const price = resolvePmFillPrice(row);
  if (price == null)
    return null;
  return formatPolymarketApiDecimal(price);
}

/** 从未结算买单视角：把 fo 条目转成 0~1 盘口价（与盘口 getOdds 同源，优先 clobPrice） */
export function clobPriceFromFoOddsEntry(entry: {
  clobPrice?: number;
  odds?: number;
} | null | undefined): number | null {
  if (!entry)
    return null;
  const clob = Number(entry.clobPrice);
  if (Number.isFinite(clob) && clob > 0 && clob < 1)
    return clob;
  // 盘口展示读的是 fo.odds；部分路径可能只写了 odds 未带 clobPrice
  const odds = Number(entry.odds);
  if (Number.isFinite(odds) && odds > 1) {
    const price = 1 / odds;
    if (price > 0 && price < 1)
      return price;
  }
  return null;
}

/** 欧赔 → 概率价（体育 sportOddsStore 只有欧赔） */
export function clobPriceFromDecimalOdds(decimalOdds: number): number | null {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1)
    return null;
  const price = 1 / decimalOdds;
  return price > 0 && price < 1 ? price : null;
}

/** 未结算时「当前价」用 live；列表已分列买入价/当前价，此函数供单测保留 */
export function resolvePmListDisplayPrice(
  row: OrderRow,
  liveClobPrice?: number | null,
): number | null {
  const live = Number(liveClobPrice);
  const status = String(row.Status ?? "").trim().toLowerCase();
  // 可卖持仓（含 0.99 启发式判赢仍 open）显示当前价；official settled 后不再显示
  const wantLive = isPmBuyOrderListRow(row)
    && row.PmSellState !== "closed"
    && row.PmSellState !== "settled"
    && status !== "reject"
    && status !== "return"
    && status !== "pending";
  if (wantLive && Number.isFinite(live) && live > 0 && live < 1)
    return live;
  return resolvePmFillPrice(row);
}

export function pmOrderDisplayPriceText(
  row: OrderRow,
  liveClobPrice?: number | null,
): string | null {
  const price = resolvePmListDisplayPrice(row, liveClobPrice);
  if (price == null)
    return null;
  return formatPolymarketApiDecimal(price);
}

/** 赔率按买入成交价（与「买入价」一致） */
export function pmOrderOddsText(row: OrderRow): string {
  const price = resolvePmFillPrice(row);
  const odds = price != null
    ? truncateOddsTo3(1 / price)
    : truncateOddsTo3(Number(row.Odds) || 0);
  return toFixed(odds, 3);
}

/** 概率价 → 展示欧赔（与「当前价」同行时必须同源） */
export function pmOddsTextFromClobPrice(clobPrice: number): string {
  if (!(clobPrice > 0 && clobPrice < 1))
    return toFixed(0, 3);
  return toFixed(truncateOddsTo3(1 / clobPrice), 3);
}
