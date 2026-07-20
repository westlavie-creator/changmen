import { describe, expect, it, beforeEach } from "vitest";
import {
  isPfOrderListRow,
  isPfSellOrderListRow,
  pfOrderBetText,
  pfOrderItemText,
  pfOrderMatchText,
  pfOrderProfitDisplayCny,
  pfOrderSideTagText,
  pfOrderStakeDisplayCny,
  resolvePfOrderListStatusClass,
} from "./pfOrderDisplay";
import type { OrderRow } from "@/types/order";
import {
  __resetPredictFunTokenMarketIdsForTests,
  rememberPredictFunTokenMarketIds,
} from "@changmen/venue-adapter/predictfun";

const pfBuy: OrderRow = {
  Type: "PredictFun",
  PfSide: "buy",
  PfSellState: "open",
  PfShares: 1.5,
  Odds: 1.666,
  BetMoney: 1,
  Money: 0,
  Status: "None",
  Match: "Team A vs Team B",
  Bet: "全场胜负",
  Item: "Team A",
  PfMarketId: "844582",
  PfTokenId: "81019144045327892",
};

describe("pfOrderDisplay", () => {
  beforeEach(() => {
    __resetPredictFunTokenMarketIdsForTests();
  });

  it("detects PF rows and side tags", () => {
    expect(isPfOrderListRow(pfBuy)).toBe(true);
    expect(isPfOrderListRow({ ...pfBuy, Type: "OB" })).toBe(false);
    expect(pfOrderSideTagText(pfBuy)).toBe("买单");
    expect(pfOrderSideTagText({ ...pfBuy, PfSide: "sell" })).toBe("卖单");
    expect(isPfSellOrderListRow({ ...pfBuy, PfSide: "sell" })).toBe(true);
  });

  it("remaps sold/sell status badges", () => {
    expect(resolvePfOrderListStatusClass(pfBuy)).toBe("None");
    expect(resolvePfOrderListStatusClass({
      ...pfBuy,
      PfSellState: "closed",
    })).toBe("PfSold");
    expect(resolvePfOrderListStatusClass({
      ...pfBuy,
      PfSide: "sell",
      BetMoney: 1.2,
    })).toBe("PfSell");
    expect(resolvePfOrderListStatusClass({
      ...pfBuy,
      Status: "Reject",
    })).toBe("Reject");
  });

  it("keeps readable labels as-is", () => {
    expect(pfOrderMatchText(pfBuy)).toBe("Team A vs Team B");
    expect(pfOrderBetText(pfBuy)).toBe("全场胜负");
    expect(pfOrderItemText(pfBuy)).toBe("Team A");
  });

  it("scales USDT BetMoney to CNY for sidebar (same as PM)", () => {
    // 1 USDT × 6.8 = 6.8 CNY
    expect(pfOrderStakeDisplayCny({
      Type: "PredictFun",
      BetMoney: 1,
    })).toBe(6.8);
    expect(pfOrderProfitDisplayCny({
      Type: "PredictFun",
      PfSide: "buy",
      Money: 0.5,
    })).toBe(3.4);
  });

  it("treats 市场 N as bare and enriches from MarketIndex", () => {
    rememberPredictFunTokenMarketIds({
      updatedAt: Date.now(),
      marketIds: ["844582"],
      entries: [{
        sourceMatchId: "1",
        categoryId: "c1",
        sourceBetId: "bet1",
        homeName: "Kits",
        awayName: "SDM",
        homeTokenId: "81019144045327892",
        awayTokenId: "999",
        homeOdds: 1.6,
        awayOdds: 2.2,
        homeMarketId: "844582",
        awayMarketId: "844582",
        map: 0,
        status: "Open",
      }],
    });
    const bare: OrderRow = {
      Type: "PredictFun",
      Match: "市场 844582",
      Bet: "全场胜负",
      Item: "81019144045327892",
      PfMarketId: "844582",
      PfTokenId: "81019144045327892",
    };
    expect(pfOrderMatchText(bare)).toBe("Kits vs SDM");
    expect(pfOrderBetText(bare)).toBe("全场胜负");
    expect(pfOrderItemText(bare)).toBe("Kits");
  });

  it("enriches bare marketId/token from MarketIndex cache", () => {
    rememberPredictFunTokenMarketIds({
      updatedAt: Date.now(),
      marketIds: ["844582"],
      entries: [{
        sourceMatchId: "1",
        categoryId: "c1",
        sourceBetId: "bet1",
        homeName: "Kits",
        awayName: "SDM",
        homeTokenId: "81019144045327892",
        awayTokenId: "999",
        homeOdds: 1.6,
        awayOdds: 2.2,
        homeMarketId: "844582",
        awayMarketId: "844582",
        map: 0,
        status: "Open",
      }],
    });
    const bare: OrderRow = {
      Type: "PredictFun",
      Match: "844582",
      Bet: "PredictFun",
      Item: "81019144045327892",
      PfMarketId: "844582",
      PfTokenId: "81019144045327892",
    };
    expect(pfOrderMatchText(bare)).toBe("Kits vs SDM");
    expect(pfOrderBetText(bare)).toBe("全场胜负");
    expect(pfOrderItemText(bare)).toBe("Kits");
  });
});
