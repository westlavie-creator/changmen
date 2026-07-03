import { describe, expect, it } from "vitest";
import { USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";
import {
  applyBuySharesAfterSell,
  buildChangmenSellVenueOrder,
  computeSellProfitDisplayCny,
  resolveBuyStakeUsdc,
  venueOrderFromOrderRow,
} from "./pmLogicalPosition";
import { scalePolymarketVenueOrdersForDisplay } from "./orders";

describe("pmLogicalPosition", () => {
  const baseRow = {
    OrderID: "0xbuy",
    Type: "Polymarket",
    Status: "None",
    Odds: 2,
    BetMoney: 70,
    Money: 0,
    CreateAt: 1_000,
    PmTokenId: "tok",
    PmShares: 10,
    PmStakeUsdc: 10,
    PmOrigin: "changmen" as const,
    PmSide: "buy" as const,
  };

  it("applyBuySharesAfterSell reduces shares but keeps BetMoney", () => {
    const order = venueOrderFromOrderRow(baseRow);
    const updated = applyBuySharesAfterSell(order, 10);
    expect(updated.pmShares).toBe(0);
    expect(updated.pmSellState).toBe("closed");
    expect(updated.pmAttributedSellShares).toBe(10);
    expect(updated.betMoney).toBe(70);
    expect(updated.money).toBe(0);
  });

  it("buildChangmenSellVenueOrder creates sell row with realized P&L", () => {
    const buy = venueOrderFromOrderRow(baseRow);
    const sell = buildChangmenSellVenueOrder(buy, {
      sellOrderId: "0xsell",
      sharesSold: 10,
      proceedsUsdc: 12,
    });
    expect(sell.orderId).toBe("0xsell");
    expect(sell.pmSide).toBe("sell");
    expect(sell.pmBuyOrderId).toBe("0xbuy");
    expect(sell.betMoney).toBe(12);
    expect(sell.pmRealizedPnlUsdc).toBe(2);
    expect(sell.money).toBe(2);
    expect(sell.pmStakeUsdc).toBe(10);
    expect(sell.item).toContain("平仓");
  });

  it("resolveBuyStakeUsdc falls back from CNY BetMoney when pmStakeUsdc missing", () => {
    const buy = venueOrderFromOrderRow({ ...baseRow, PmStakeUsdc: undefined, BetMoney: 70 });
    expect(resolveBuyStakeUsdc(buy)).toBe(10);
    const sell = buildChangmenSellVenueOrder(buy, {
      sellOrderId: "0xsell2",
      sharesSold: 10,
      proceedsUsdc: 12,
    });
    expect(sell.money).toBe(2);
    expect(sell.betMoney).toBe(12);
  });

  it("70 CNY buy @ 1.25 → sell proceeds 10 USDC shows ~70 CNY with zero P&L", () => {
    const buy = venueOrderFromOrderRow({
      ...baseRow,
      BetMoney: 70,
      PmStakeUsdc: 10,
      PmShares: 12.5,
      Odds: 1.25,
    });
    const sell = buildChangmenSellVenueOrder(buy, {
      sellOrderId: "0xsell-regression",
      sharesSold: 12.5,
      proceedsUsdc: 10,
    });
    expect(sell.betMoney).toBe(10);
    expect(sell.pmRealizedPnlUsdc).toBe(0);
    expect(sell.money).toBe(0);

    const [scaledSell] = scalePolymarketVenueOrdersForDisplay([sell]);
    expect(scaledSell.betMoney).toBe(70);
    expect(scaledSell.money).toBe(0);
    expect(computeSellProfitDisplayCny(scaledSell.betMoney, sell.pmStakeUsdc!)).toBe(0);
    expect(USDT_CNY_EXCHANGE).toBe(7);
  });

  it("resolveBuyStakeUsdc keeps reduced pmStakeUsdc after partial sell", () => {
    const partial = applyBuySharesAfterSell(venueOrderFromOrderRow(baseRow), 4);
    expect(resolveBuyStakeUsdc(partial)).toBe(6);
  });

  it("partial sell keeps remaining shares on buy", () => {
    const order = venueOrderFromOrderRow(baseRow);
    const updated = applyBuySharesAfterSell(order, 4);
    expect(updated.pmShares).toBe(6);
    expect(updated.pmSellState).toBe("partial");
    expect(updated.betMoney).toBe(70);
  });
});
