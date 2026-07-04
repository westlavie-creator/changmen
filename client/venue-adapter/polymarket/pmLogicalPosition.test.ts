import { describe, expect, it } from "vitest";
import { USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";
import {
  hasOpenPolymarketPosition,
  resolveBuyStakeUsdc,
  resolvePmRemainingShares,
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

  it("resolveBuyStakeUsdc falls back from CNY BetMoney when pmStakeUsdc missing", () => {
    const buy = venueOrderFromOrderRow({ ...baseRow, PmStakeUsdc: undefined, BetMoney: 70 });
    expect(resolveBuyStakeUsdc(buy)).toBe(10);
    expect(USDT_CNY_EXCHANGE).toBe(7);
  });

  it("resolvePmRemainingShares subtracts attributed sells", () => {
    const order = venueOrderFromOrderRow({ ...baseRow, PmAttributedSellShares: 4 });
    expect(resolvePmRemainingShares(order)).toBe(6);
  });

  it("hasOpenPolymarketPosition false when market settled", () => {
    const order = venueOrderFromOrderRow({ ...baseRow, Status: "Win" });
    expect(hasOpenPolymarketPosition(order)).toBe(false);
  });

  it("hasOpenPolymarketPosition true while Status=None and shares remain", () => {
    const order = venueOrderFromOrderRow(baseRow);
    expect(hasOpenPolymarketPosition(order)).toBe(true);
  });
});
