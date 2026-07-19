import type { OrderRow } from "@/types/order";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";
import { toFixed } from "@changmen/client-core/shared/format";
import { Currency, getExchange } from "@changmen/shared/currency";
import { resolvePmFillShares, resolvePmRemainingShares } from "@changmen/venue-adapter/polymarket";
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
    const state = String(row.PmSellState ?? "").toLowerCase();
    // partial 但剩余尘量已视为 0 → 已卖出
    if (state === "partial" && resolvePmRemainingShares(row) > 0)
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
    // 盈亏已记买单；卖单 Money 应为 0。角标优先 pmRealizedPnlUsdc，兼容迁移前 Money
    const pnl = Number(row.PmRealizedPnlUsdc);
    if (Number.isFinite(pnl) && pnl !== 0) {
      if (pnl > 0)
        return "Win";
      if (pnl < 0)
        return "Lose";
    }
    const legacyMoney = Number(row.Money) || 0;
    if (legacyMoney > 0)
      return "Win";
    if (legacyMoney < 0)
      return "Lose";
    const bet = Number(row.BetMoney) || 0;
    if (bet <= 0)
      return "None";
    return "Return";
  }

  if (isPmManuallySoldBuy(row)) {
    const state = String(row.PmSellState ?? "").toLowerCase();
    if (state === "partial" && resolvePmRemainingShares(row) > 0)
      return raw; // 部分卖出仍待结算剩余仓
    return "PmSold";
  }
  if (isPmMarketSettledBuy(row))
    return "PmSettled";

  return raw;
}

export function pmOrderSharesText(row: OrderRow): string | null {
  if (isPmSellOrderListRow(row)) {
    const sold = Number(row.PmShares);
    if (!Number.isFinite(sold) || sold <= 0.0001)
      return null;
    return formatPolymarketApiDecimal(sold);
  }
  // 买单始终展示原始成交份额（订单记录）；剩余仓位由「已卖出/部分卖出」标签表达
  const fill = resolvePmFillShares(row);
  if (!Number.isFinite(fill) || fill <= 0.0001)
    return null;
  return formatPolymarketApiDecimal(fill);
}

/**
 * 买单原始本金（CNY）：订单记录口径。
 * - 优先库内 BetMoney（卖出后不再改写原始本金）
 * - 旧数据 closed 且 bet_money=0：用 fill×买入价还原
 */
export function pmOrderOriginalStakeDisplayCny(row: OrderRow): number {
  const stored = Number(row.BetMoney) || 0;
  if (stored > 0)
    return stored;

  const attr = Number(row.PmAttributedSellShares) || 0;
  const soldProgress = attr > 0
    || row.PmSellState === "partial"
    || row.PmSellState === "closed"
    || row.PmSellState === "settled";
  if (!soldProgress)
    return 0;

  const fill = resolvePmFillShares(row);
  const price = resolvePmFillPrice(row);
  if (fill > 0.0001 && price != null && price > 0)
    return Math.round(fill * price * getExchange(Currency.USDT));
  return 0;
}

/** 买单展示本金（CNY）= 原始成交本金；卖单为回款 BetMoney */
export function pmOrderStakeDisplayCny(row: OrderRow): number {
  if (isPmSellOrderListRow(row))
    return Number(row.BetMoney) || 0;
  return pmOrderOriginalStakeDisplayCny(row);
}

/** 侧栏价格列标题：标明买单/卖单 */
export function pmOrderPriceLabel(row: OrderRow): string {
  return isPmSellOrderListRow(row) ? "卖单卖出价" : "买单买入价";
}

/** 侧栏侧别标签：买单 / 卖单 */
export function pmOrderSideTagText(row: OrderRow): string | null {
  if (!isPmOrderListRow(row))
    return null;
  return isPmSellOrderListRow(row) ? "卖单" : "买单";
}

/** CLOB trade.price；旧单无字段时回退 odds；有卖出进度时勿用剩余 stake÷fill */
export function resolvePmFillPrice(row: OrderRow): number | null {
  const stored = Number(row.PmFillPrice);
  if (Number.isFinite(stored) && stored > 0 && stored < 1)
    return stored;

  const attr = Number(row.PmAttributedSellShares) || 0;
  const shares = Number(row.PmShares);
  const stakeUsdc = Number(row.PmStakeUsdc);
  // 仅无卖出归因时 stake 才是满仓成本；partial/closed 的 pmStakeUsdc 是剩余
  if (
    attr <= 0
    && Number.isFinite(shares)
    && shares > 0.0001
    && Number.isFinite(stakeUsdc)
    && stakeUsdc > 0
  ) {
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
