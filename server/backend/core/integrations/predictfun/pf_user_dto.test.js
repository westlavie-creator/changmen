import { describe, expect, it } from "vitest";
import {
  toUserPfGetOrderInfo,
  toUserPfSubmitOrderInfo,
  toUserPfSubmitSellInfo,
  toUserPfVenueOrder,
  toUserPfVenueOrders,
} from "./pf_user_dto.js";

describe("pf_user_dto", () => {
  it("strips official fee / fill cost / execution ids from venue order", () => {
    const scrubbed = toUserPfVenueOrder({
      provider: "PredictFun",
      orderId: "0xabc",
      odds: 2,
      createAt: 1,
      betMoney: 10,
      reward: 0,
      money: 0,
      status: "none",
      game: "",
      match: "m",
      bet: "b",
      item: "i",
      pfHoldShares: 20,
      pfNotionalUsdt: 10,
      pfBookPrice: 0.5,
      pfShares: 21,
      pfFillCostUsdt: 9.8,
      pfFeeAmountWei: "1",
      pfFeeType: "SHARES",
      pfFeeUsdt: 0.1,
      pfFeeRateBps: 200,
      pfOfficialStatus: "FILLED",
      pfAmountFilled: "21",
      pfOrderHash: "0xabc",
      pfApiOrderId: "ord-1",
      pfSide: "buy",
      pfSellState: "open",
    });
    expect(scrubbed.pfHoldShares).toBe(20);
    expect(scrubbed.pfNotionalUsdt).toBe(10);
    expect(scrubbed.pfBookPrice).toBe(0.5);
    expect(scrubbed.pfShares).toBe(21);
    expect(scrubbed.pfFillCostUsdt).toBeUndefined();
    expect(scrubbed.pfFeeAmountWei).toBeUndefined();
    expect(scrubbed.pfFeeType).toBeUndefined();
    expect(scrubbed.pfFeeUsdt).toBeUndefined();
    expect(scrubbed.pfFeeRateBps).toBeUndefined();
    expect(scrubbed.pfOfficialStatus).toBeUndefined();
    expect(scrubbed.pfAmountFilled).toBeUndefined();
    expect(scrubbed.pfOrderHash).toBeUndefined();
    expect(scrubbed.pfApiOrderId).toBeUndefined();
    expect(scrubbed.pfSellState).toBe("open");
  });

  it("folds internal closing to user open", () => {
    expect(toUserPfVenueOrder({
      provider: "PredictFun",
      orderId: "x",
      odds: 1,
      createAt: 0,
      betMoney: 1,
      reward: 0,
      money: 0,
      status: "none",
      game: "",
      match: "",
      bet: "",
      item: "",
      pfSellState: "closing",
    })?.pfSellState).toBe("open");
  });

  it("submit/getOrder/sell infos drop official payloads", () => {
    expect(toUserPfSubmitOrderInfo({
      orderId: "0x1",
      code: "ok",
      bookPrice: 0.4,
      bookOdds: 2.5,
      playerId: 42,
      pending: true,
      result: { success: true, data: { secret: 1 } },
      pfOrderHash: "0x1",
      pfApiOrderId: "a",
      balance: 100,
    })).toEqual({
      orderId: "0x1",
      code: "ok",
      bookPrice: 0.4,
      bookOdds: 2.5,
      playerId: 42,
      pending: true,
      balance: 100,
    });

    const getInfo = toUserPfGetOrderInfo({
      orderId: "0x1",
      found: true,
      settlement: "filled",
      order: {
        provider: "PredictFun",
        orderId: "0x1",
        odds: 2,
        createAt: 1,
        betMoney: 10,
        reward: 0,
        money: 0,
        status: "none",
        game: "",
        match: "",
        bet: "",
        item: "",
        pfHoldShares: 9,
        pfFillCostUsdt: 8,
      },
      official: { status: "FILLED", amount: "8" },
      officialStatus: "FILLED",
      refunded: false,
    });
    expect(getInfo.official).toBeUndefined();
    expect(getInfo.officialStatus).toBeUndefined();
    expect(getInfo.order.pfHoldShares).toBe(9);
    expect(getInfo.order.pfFillCostUsdt).toBeUndefined();

    expect(toUserPfSubmitSellInfo({
      buyOrderId: "b",
      sellOrderId: "s",
      shares: 9,
      proceedsUsdt: 10,
      profit: 1,
      playerId: 42,
      officialStatus: "FILLED",
    }).officialStatus).toBeUndefined();

    expect(toUserPfVenueOrders([null, { provider: "PredictFun", orderId: "x", odds: 1, createAt: 0, betMoney: 1, reward: 0, money: 0, status: "none", game: "", match: "", bet: "", item: "", pfFeeUsdt: 1 }])).toHaveLength(1);
  });
});
