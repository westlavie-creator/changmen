import { describe, expect, it } from "vitest";
import { ViewBetItem } from "./match.js";

describe("ViewBetItem PredictFun Sources fallback", () => {
  it("uses GetMatchs Sources odds when fo empty", () => {
    const item = new ViewBetItem(
      {
        Type: "PredictFun",
        BetID: "slug#m3",
        HomeID: "tok-h",
        AwayID: "tok-a",
        HomeOdds: 2.439,
        AwayOdds: 1.612,
        Status: "Normal",
        HomeMarketID: "844582",
        AwayMarketID: "844582",
      },
      "218389",
    );
    expect(item.fallbackHomeOdds).toBe(2.439);
    expect(item.fallbackAwayOdds).toBe(1.612);
    expect(item.homeSubscribeId).toBe("844582");
    expect(item.awaySubscribeId).toBe("844582");
    // Sources 2.4391 → truncate 2.439
    const item2 = new ViewBetItem(
      {
        Type: "PredictFun",
        BetID: "slug#m3",
        HomeID: "tok-h2",
        AwayID: "tok-a2",
        HomeOdds: 2.4399,
        AwayOdds: 1.6129,
        Status: "Normal",
      },
      "218389",
    );
    expect(item2.fallbackHomeOdds).toBe(2.439);
    expect(item2.fallbackAwayOdds).toBe(1.612);
    expect(item.getOdds("Home")).toBe(2.439);
    expect(item.getOdds("Away")).toBe(1.612);
  });
});
