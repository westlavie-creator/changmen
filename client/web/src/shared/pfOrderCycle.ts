/**
 * PF 会员订单：买卖闭环（买单为主行，卖单挂接）
 */
import type { AdminOrderRow } from "@/types/admin";
import { resolvePfFillPrice } from "@/shared/pfOrderDisplay";
import { adminOrderToOrderRow } from "@/shared/adminOrderDisplay";

export interface PfOrderCycle {
  buy: AdminOrderRow;
  sell?: AdminOrderRow;
  /** 买入花费 U */
  buyStakeUsdt: number;
  /** 买入份额 */
  buyShares: number | null;
  /** 买手续费份额 */
  buyFeeShares: number | null;
  /** 净持仓 = 买入份额 − 买手续费份额 */
  netShares: number | null;
  /** 官方费率 bps */
  feeRateBps: number | null;
  /** 卖出回款 U */
  sellProceedsUsdt: number | null;
  /** 卖手续费份额 */
  sellFeeShares: number | null;
  /** 卖手续费 U（COLLATERAL 或 SHARES×卖出价） */
  sellFeeUsdt: number | null;
  /** 最终到手 U；未完结为 null */
  finalUsdt: number | null;
  /** 盈亏 = 最终到手 − 买入；未完结为 null */
  profitUsdt: number | null;
}

function feeSharesFromRow(row: AdminOrderRow | undefined): number | null {
  if (!row?.pfFeeAmountWei)
    return null;
  const type = String(row.pfFeeType || "").toUpperCase();
  if (type === "COLLATERAL")
    return null;
  try {
    const shares = Number(BigInt(String(row.pfFeeAmountWei))) / 1e18;
    if (Number.isFinite(shares) && shares > 0)
      return shares;
  }
  catch {
    /* ignore */
  }
  return null;
}

function feeUsdtFromRow(row: AdminOrderRow | undefined, priceHint: number | null): number | null {
  if (!row)
    return null;
  const usdt = Number(row.pfFeeUsdt);
  if (Number.isFinite(usdt) && usdt > 0)
    return usdt;
  const shares = feeSharesFromRow(row);
  if (shares == null)
    return null;
  const price = priceHint
    ?? resolvePfFillPrice(adminOrderToOrderRow(row));
  if (price == null || !(price > 0))
    return null;
  return shares * price;
}

export function pfFeeSharesFromAdminOrder(row: AdminOrderRow): number | null {
  return feeSharesFromRow(row);
}

export function pfNetShares(buyShares: number | null, buyFeeShares: number | null): number | null {
  if (buyShares == null || !(buyShares > 0))
    return null;
  const fee = buyFeeShares != null && buyFeeShares > 0 ? buyFeeShares : 0;
  const net = buyShares - fee;
  return net > 0 ? net : 0;
}

/**
 * 最终到手：
 * 1. 已卖出 → 卖出回款 − 卖手续费U
 * 2. Win → betMoney + money
 * 3. Lose → 0
 * 4. Reject → null（—）
 * 5. 仍持仓 → null
 */
export function resolvePfCycleFinalUsdt(input: {
  buy: AdminOrderRow;
  sold: boolean;
  sellProceedsUsdt: number | null;
  sellFeeUsdt: number | null;
}): number | null {
  const { buy, sold, sellProceedsUsdt, sellFeeUsdt } = input;
  const status = String(buy.status || "").toLowerCase();

  if (sold) {
    if (sellProceedsUsdt == null || !Number.isFinite(sellProceedsUsdt))
      return null;
    const fee = sellFeeUsdt != null && sellFeeUsdt > 0 ? sellFeeUsdt : 0;
    return Math.max(0, sellProceedsUsdt - fee);
  }
  if (status === "reject")
    return null;
  if (status === "lose")
    return 0;
  if (status === "win") {
    const stake = Number(buy.betMoney) || 0;
    const money = Number(buy.money) || 0;
    return stake + money;
  }
  return null;
}

export function resolvePfCycleProfitUsdt(
  buyStakeUsdt: number,
  finalUsdt: number | null,
): number | null {
  if (finalUsdt == null || !Number.isFinite(finalUsdt))
    return null;
  return finalUsdt - (Number(buyStakeUsdt) || 0);
}

export function buildPfCycles(orders: AdminOrderRow[]): PfOrderCycle[] {
  const list = Array.isArray(orders) ? orders : [];
  const sells = list.filter(o => String(o.pfSide || "").toLowerCase() === "sell");
  const buys = list.filter(o => String(o.pfSide || "").toLowerCase() !== "sell");

  const sellByBuyId = new Map<string, AdminOrderRow>();
  const sellByOrderId = new Map<string, AdminOrderRow>();
  for (const s of sells) {
    const oid = String(s.orderId || "").trim();
    if (oid)
      sellByOrderId.set(oid, s);
    const buyId = String(s.pfBuyOrderId || "").trim();
    if (buyId)
      sellByBuyId.set(buyId, s);
  }

  return buys.map((buy) => {
    const buyId = String(buy.orderId || "").trim();
    const sellFromLink = buyId ? sellByBuyId.get(buyId) : undefined;
    const sellFromId = buy.pfSellOrderId
      ? sellByOrderId.get(String(buy.pfSellOrderId).trim())
      : undefined;
    const sell = sellFromLink || sellFromId;

    const buyStakeUsdt = Number(buy.betMoney) || 0;
    const buyShares = Number(buy.pfShares) > 0 ? Number(buy.pfShares) : null;
    const buyFeeShares = feeSharesFromRow(buy);
    const netShares = pfNetShares(buyShares, buyFeeShares);
    const feeRateBps = Number.isFinite(Number(buy.pfFeeRateBps)) && Number(buy.pfFeeRateBps) >= 0
      ? Number(buy.pfFeeRateBps)
      : null;

    let sellProceedsUsdt: number | null = null;
    const fromBuy = Number(buy.pfSellProceeds);
    if (Number.isFinite(fromBuy) && fromBuy >= 0)
      sellProceedsUsdt = fromBuy;
    else if (sell) {
      const fromSell = Number(sell.betMoney);
      if (Number.isFinite(fromSell) && fromSell >= 0)
        sellProceedsUsdt = fromSell;
    }

    const sellPrice = sell
      ? resolvePfFillPrice(adminOrderToOrderRow(sell))
      : null;
    const sellFeeShares = feeSharesFromRow(sell);
    const sellFeeUsdt = feeUsdtFromRow(sell, sellPrice);

    const sold = String(buy.pfSellState || "").toLowerCase() === "closed" || !!sell;

    const finalUsdt = resolvePfCycleFinalUsdt({
      buy,
      sold,
      sellProceedsUsdt,
      sellFeeUsdt,
    });
    const profitUsdt = resolvePfCycleProfitUsdt(buyStakeUsdt, finalUsdt);

    return {
      buy,
      sell,
      buyStakeUsdt,
      buyShares,
      buyFeeShares,
      netShares,
      feeRateBps,
      sellProceedsUsdt,
      sellFeeShares,
      sellFeeUsdt,
      finalUsdt,
      profitUsdt,
    };
  });
}
