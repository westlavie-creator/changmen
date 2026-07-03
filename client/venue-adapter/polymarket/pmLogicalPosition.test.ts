import { describe, expect, it } from "vitest";
import { USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";
import {
  applyBuySharesAfterSell,
  buildChangmenSellVenueOrder,
  venueOrderFromOrderRow,
} from "./pmLogicalPosition";

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
    expect(sell.betMoney).toBe(0);
    expect(sell.pmRealizedPnlUsdc).toBe(2);
    expect(sell.money).toBe(2 * USDT_CNY_EXCHANGE);
    expect(sell.item).toContain("平仓");
  });

  it("partial sell keeps remaining shares on buy", () => {
    const order = venueOrderFromOrderRow(baseRow);
    const updated = applyBuySharesAfterSell(order, 4);
    expect(updated.pmShares).toBe(6);
    expect(updated.pmSellState).toBe("partial");
    expect(updated.betMoney).toBe(70);
  });
});
