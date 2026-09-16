import { describe, expect, it } from "vitest";
import { parseObSportAmount, resolveObSportAmountSession } from "@/runtime/obSportAmount";
import { podBoardMarketsFromObDetail, mergePodBoardMarkets } from "@/runtime/podMarketPrefetch";
import { podYaboDailyLossBlocked } from "@/runtime/podYabo/loss";

describe("obSportAmount", () => {
  it("reads amount from nested panda envelopes", () => {
    expect(parseObSportAmount({ data: { amount: 1288.5 } })).toBe(1288.5);
    expect(parseObSportAmount({ gold: "80" })).toBe(80);
    expect(parseObSportAmount({})).toBe(0);
  });

  it("rewrites official shell gateway before amount fetch", () => {
    const session = resolveObSportAmountSession({
      provider: "OB",
      sportOb: {
        token: "4be9f09298fe183b0cc029d3db4b32d1cc2d8d89",
        gateway: "https://user-pc-new.dbgaming.com",
        referer: "https://user-pc-new.dbgaming.com/",
        venueMemberId: "1009139033518055424",
      },
    });
    expect(session?.gateway).toBe("https://api.dbsporxxxw1box.com");
    expect(session?.uid).toBe("1009139033518055424");
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
