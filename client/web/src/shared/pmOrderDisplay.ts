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

/** 侧栏展示的 PM 买单（卖单由 orderListDisplayRows 过滤） */
export function isPmOrderListRow(row: OrderRow): boolean {
  return String(row.Type ?? "").trim() === "Polymarket" && row.PmSide !== "sell";
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

export function pmOrderOddsText(row: OrderRow): string {
  const price = resolvePmFillPrice(row);
  const odds = price != null
    ? truncateOddsTo3(1 / price)
    : truncateOddsTo3(Number(row.Odds) || 0);
  return toFixed(odds, 3);
}
