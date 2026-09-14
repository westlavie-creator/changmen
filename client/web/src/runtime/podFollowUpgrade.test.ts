import { describe, expect, it } from "vitest";
import { parseObSportAmount } from "@/runtime/obSportAmount";
import { podBoardMarketsFromObDetail, mergePodBoardMarkets } from "@/runtime/podMarketPrefetch";
import { podYaboDailyLossBlocked } from "@/runtime/podYabo/loss";

describe("obSportAmount", () => {
  it("reads amount from nested panda envelopes", () => {
    expect(parseObSportAmount({ data: { amount: 1288.5 } })).toBe(1288.5);
    expect(parseObSportAmount({ gold: "80" })).toBe(80);
    expect(parseObSportAmount({})).toBe(0);
  });
});

describe("podYabo/loss", () => {
  it("blocks auto when settled loss plus open stake reach the cap", () => {
    expect(podYaboDailyLossBlocked({ todayProfit: -50, openStake: 0, maxDailyLoss: 0 })).toBe(false);
    expect(podYaboDailyLossBlocked({ todayProfit: -50, openStake: 0, maxDailyLoss: 100 })).toBe(false);
    expect(podYaboDailyLossBlocked({ todayProfit: -100, openStake: 0, maxDailyLoss: 100 })).toBe(true);
    expect(podYaboDailyLossBlocked({ todayProfit: 20, openStake: 100, maxDailyLoss: 80 })).toBe(true);
  });
});

describe("podMarketPrefetch", () => {
  it("maps detail selections onto board markets and merges by line", () => {
    const rows = podBoardMarketsFromObDetail([
      {
        MarketCode: "totals",
        Line: 2.5,
        Name: "大小 2.5",
        Selections: [
          { Side: "over", Odds: 1.91, OddID: "oid-o" },
          { Side: "under", Odds: 1.88, OddID: "oid-u" },
        ],
      },
    ]);
    expect(rows[0]).toMatchObject({
      marketCode: "totals",
      line: 2.5,
      oidHome: "oid-o",
      oidAway: "oid-u",
      quoteHome: 1.91,
    });
    expect(mergePodBoardMarkets(rows, rows)).toHaveLength(1);
  });
});
