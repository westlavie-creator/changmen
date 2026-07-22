/**
 * PF 会员订单：买卖闭环（买单为主行 / 经济真相；卖单挂接为凭证+展示）
 *
 * 设计原则：用户只认 changmen；changmen 只认 PF 官网；用户端只读 RDS。
 * RDS 份额/回款已是 changmen 处理结果：
 * - 持仓 = 官网成交 − 官网份额费 − Changmencodefee 买入份额（pfHoldShares）
 * - 回款 = 官网回款 − 官网 USDT 费 − Changmencodefee 卖出 USDT（pfSellProceeds）
 */
import type { AdminOrderRow } from "@/types/admin";

export interface PfOrderCycle {
  buy: AdminOrderRow;
  sell?: AdminOrderRow;
  /** 买入实付 U（bet_money） */
  buyStakeUsdt: number;
  /** 名义买入 U（限价×份额，如 14.12） */
  buyNotionalUsdt: number | null;
  /** 链上实付 U（可低于名义） */
  buyFillCostUsdt: number | null;
  /** house 价差 = 名义 − 实付（有两者时） */
  houseEdgeUsdt: number | null;
  /** 买入成交份额 */
  buyShares: number | null;
  /** 买手续费份额 */
  buyFeeShares: number | null;
  /** 净持仓 = 库内 pfHoldShares（已含官网 + Changmencodefee 扣份额） */
  netShares: number | null;
  /** 官方费率 bps */
  feeRateBps: number | null;
  /** 卖出回款 U（RDS：买单 pfSellProceeds，已含官网 + Changmencodefee 扣 USDT） */
  sellProceedsUsdt: number | null;
  /** 卖手续费份额（RDS 明细，不参与回款重算） */
  sellFeeShares: number | null;
  /** 卖手续费 U（RDS 明细，不参与回款重算） */
  sellFeeUsdt: number | null;
  /** 最终到手 U（已卖=RDS 回款）；未完结为 null */
  finalUsdt: number | null;
  /** 盈亏 = 最终到手 − 买入实付；未完结为 null */
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

function feeUsdtFromRow(row: AdminOrderRow | undefined, _priceHint: number | null): number | null {
  if (!row)
    return null;
  // 仅 COLLATERAL 的库内 USDT；SHARES 不估成 U（管理端走「份」列）
  if (String(row.pfFeeType || "").toUpperCase() === "SHARES")
    return null;
  const usdt = Number(row.pfFeeUsdt);
  if (Number.isFinite(usdt) && usdt > 0)
    return usdt;
  return null;
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
 * 最终到手 U（只读 RDS 口径，不在此扣手续费）：
 * 1. 已卖出 → RDS 卖出回款（买单 pfSellProceeds 优先；无则卖单 betMoney 旧单兜底）
 * 2. Win → betMoney + money
 * 3. Lose → 0
 * 4. Reject → null（—）
 * 5. 仍持仓 → null
 */
export function resolvePfCycleFinalUsdt(input: {
  buy: AdminOrderRow;
  sold: boolean;
  sellProceedsUsdt: number | null;
}): number | null {
  const { buy, sold, sellProceedsUsdt } = input;
  const status = String(buy.status || "").toLowerCase();

  if (sold) {
    if (sellProceedsUsdt == null || !Number.isFinite(sellProceedsUsdt))
      return null;
    return sellProceedsUsdt;
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
  const list = (Array.isArray(orders) ? orders : [])
    .filter(o => String(o.provider || "").trim() === "PredictFun");
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
    const storedNotional = Number(buy.pfNotionalUsdt);
    const buyNotionalUsdt = Number.isFinite(storedNotional) && storedNotional > 0
      ? storedNotional
      : null;
    const storedFill = Number(buy.pfFillCostUsdt);
    const buyFillCostUsdt = Number.isFinite(storedFill) && storedFill > 0
      ? storedFill
      : null;
    const houseEdgeUsdt = buyNotionalUsdt != null && buyFillCostUsdt != null
      ? buyNotionalUsdt - buyFillCostUsdt
      : null;
    const fillShares = Number(buy.pfShares) > 0 ? Number(buy.pfShares) : null;
    const buyFeeShares = feeSharesFromRow(buy);
    // 只读 RDS 持仓；无 hold 时不在前端推算手续费
    const storedHold = Number(buy.pfHoldShares);
    const netShares = Number.isFinite(storedHold) && storedHold > 0
      ? storedHold
      : (fillShares != null && fillShares > 0 ? fillShares : null);
    const buyShares = fillShares;
    const feeRateBps = Number.isFinite(Number(buy.pfFeeRateBps)) && Number(buy.pfFeeRateBps) >= 0
      ? Number(buy.pfFeeRateBps)
      : null;

    let sellProceedsUsdt: number | null = null;
    // 回款真相在买单；卖单 betMoney 仅旧单/镜像兜底（勿当投注本金）
    const fromBuy = Number(buy.pfSellProceeds);
    if (Number.isFinite(fromBuy) && fromBuy >= 0)
      sellProceedsUsdt = fromBuy;
    else if (sell) {
      const fromSell = Number(sell.betMoney);
      if (Number.isFinite(fromSell) && fromSell >= 0)
        sellProceedsUsdt = fromSell;
    }

    const sellFeeShares = feeSharesFromRow(sell);
    const sellFeeUsdt = feeUsdtFromRow(sell, null);

    const sold = String(buy.pfSellState || "").toLowerCase() === "closed" || !!sell;

    const finalUsdt = resolvePfCycleFinalUsdt({
      buy,
      sold,
      sellProceedsUsdt,
    });
    const profitUsdt = resolvePfCycleProfitUsdt(buyStakeUsdt, finalUsdt);

    return {
      buy,
      sell,
      buyStakeUsdt,
      buyNotionalUsdt,
      buyFillCostUsdt,
      houseEdgeUsdt,
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
