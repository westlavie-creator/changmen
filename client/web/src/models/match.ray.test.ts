import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { ViewBetItem } from "@/models/match";
import { useOddsStore } from "@/stores/oddsStore";

describe("viewBetItem RAY A8 parity", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("ignores GetMatchs Locked Status and reads fo", () => {
    const odds = useOddsStore();
    odds.save("RAY", {
      id: "74232466",
      odds: 2.2,
      isLock: false,
      betId: "16854",
      time: Date.now(),
    });

    const item = new ViewBetItem(
      {
        Type: "RAY",
        BetID: "16854",
        HomeID: "74232466",
        AwayID: "74232467",
        HomeOdds: 0,
        AwayOdds: 0,
        Status: "Locked",
      },
      "38398575",
    );

    expect(item.getOdds("Home")).toBe(2.2);
  });

  it("still respects fo.isLock for RAY", () => {
    const odds = useOddsStore();
    odds.save("RAY", {
      id: "74232466",
      odds: 2.2,
      isLock: true,
      betId: "16854",
      time: Date.now(),
    });

    const item = new ViewBetItem(
      {
        Type: "RAY",
        BetID: "16854",
        HomeID: "74232466",
        AwayID: "74232467",
        HomeOdds: 0,
        AwayOdds: 0,
        Status: "Normal",
      },
      "38398575",
    );

    expect(item.getOdds("Home")).toBe(0);
  });
});
