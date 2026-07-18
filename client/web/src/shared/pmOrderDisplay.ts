import type { OrderRow } from "@/types/order";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";
import { toFixed } from "@changmen/client-core/shared/format";

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
  const wantLive = isPmBuyOrderListRow(row)
    && row.PmSellState !== "closed"
    && row.PmSellState !== "settled"
    && (!status || status === "none");
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
