import { describe, expect, it } from "vitest";
import { BetOption } from "@changmen/client-core/models/betOption";
import { BetResult } from "@changmen/client-core/models/betResult";
import { getExchange, Currency } from "@changmen/shared/currency";
import {
  buildPolymarketMatchedBuyVenueOrderFromBet,
  buildPolymarketMatchedBuyVenueOrderUsdc,
} from "./pmPostFillOrder";

describe("buildPolymarketMatchedBuyVenueOrderUsdc", () => {
  it("builds from matched POST making/taking amounts", () => {
    const order = buildPolymarketMatchedBuyVenueOrderUsdc(
      "0xabc",
      {
        success: true,
        status: "matched",
        // 10 USDC → 10e6 micro; 20 shares → 20e6 micro @ 0.5
        makingAmount: "10000000",
        takingAmount: "20000000",
      },
      {
        odds: 2,
        game: "CS",
        match: "A vs B",
        bet: "Map 1",
        item: "A",
        pmTokenId: "tok",
        pmConditionId: "cond",
      },
    );
    expect(order).toMatchObject({
      provider: "Polymarket",
      orderId: "0xabc",
      odds: 2,
      betMoney: 10,
      pmShares: 20,
      pmFillPrice: 0.5,
      pmStakeUsdc: 10,
      pmSide: "buy",
      pmSellState: "open",
      pmOrigin: "changmen",
      status: "none",
      game: "CS",
      match: "A vs B",
      item: "A",
    });
    expect(order?.reward).toBe(20);
  });

  it("returns null without fill amounts", () => {
    expect(buildPolymarketMatchedBuyVenueOrderUsdc("0x1", {
      success: true,
      status: "matched",
      takingAmount: "0",
    })).toBeNull();
  });
});

describe("buildPolymarketMatchedBuyVenueOrderFromBet", () => {
  it("scales USDC to CNY display and skips delayed", () => {
    const option = new BetOption("Polymarket", "cond", "tok", "Home", 10, "Home", 2);
    option.match = { game: "CS", title: "A vs B" } as never;
    option.bet = {
      homeName: "A",
      awayName: "B",
      name: "Map",
      getBetName: () => "Map 1",
    } as never;
    option.target = "Home";
    option.itemId = "tok";
    option.betId = "cond";

    const delayed = new BetResult("Polymarket", true, "delayed", {}, {
      success: true,
      status: "delayed",
      orderID: "0xd",
    });
    delayed.orderId = "0xd";
    delayed.pending = true;
    expect(buildPolymarketMatchedBuyVenueOrderFromBet(option, delayed)).toBeNull();

    const matched = new BetResult("Polymarket", true, "ok", {}, {
      success: true,
      status: "matched",
      orderID: "0xm",
      makingAmount: "10000000",
      takingAmount: "20000000",
    });
    matched.orderId = "0xm";
    matched.beginTime = 1_700_000_000_000;
    const order = buildPolymarketMatchedBuyVenueOrderFromBet(option, matched);
    const fx = getExchange(Currency.USDT);
    expect(order?.betMoney).toBeCloseTo(10 * fx, 4);
    expect(order?.pmStakeUsdc).toBe(10);
    expect(order?.item).toBe("A");
    expect(order?.match).toBe("A vs B");
    expect(order?.createAt).toBe(1_700_000_000_000);
  });
});
