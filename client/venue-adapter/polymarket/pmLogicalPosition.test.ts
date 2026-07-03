import { describe, expect, it } from "vitest";
import { USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";
import {
  applyChangmenSellToVenueOrder,
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
  };

  it("applyChangmenSellToVenueOrder writes row Money from realized proceeds", () => {
    const order = venueOrderFromOrderRow(baseRow);
    const sold = applyChangmenSellToVenueOrder(order, {
      sharesSold: 10,
      proceedsUsdc: 12,
    });
    expect(sold.pmShares).toBe(0);
    expect(sold.pmSellState).toBe("closed");
    expect(sold.pmAttributedSellShares).toBe(10);
    expect(sold.pmRealizedPnlUsdc).toBe(2);
    expect(sold.money).toBe(2 * USDT_CNY_EXCHANGE);
  });

  it("partial sell keeps remaining shares and accumulates realized", () => {
    const order = venueOrderFromOrderRow(baseRow);
    const partial = applyChangmenSellToVenueOrder(order, {
      sharesSold: 4,
      proceedsUsdc: 5,
    });
    expect(partial.pmShares).toBe(6);
    expect(partial.pmSellState).toBe("partial");
    expect(partial.pmAttributedSellShares).toBe(4);
    expect(partial.pmRealizedPnlUsdc).toBe(1);
    expect(partial.money).toBe(1 * USDT_CNY_EXCHANGE);
  });
});
