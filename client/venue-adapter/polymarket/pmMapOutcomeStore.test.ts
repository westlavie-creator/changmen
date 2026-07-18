import { describe, expect, it } from "vitest";

import {
  lookupPmMapOutcomeByToken,
  pmMapOutcomeWinnerLabel,
  replacePmMapOutcomesFromIndex,
} from "./pmMapOutcomeStore";

describe("pmMapOutcomeStore", () => {
  it("indexes outcomes by home/away token and clears on null", () => {
    replacePmMapOutcomesFromIndex({
      updatedAt: 1,
      assetIds: ["h", "a"],
      entries: [{
        sourceMatchId: "e1",
        marketId: "c1",
        homeTokenId: "h",
        awayTokenId: "a",
        sourceBetId: "c1",
        map: 3,
        homeName: "Heroic",
        awayName: "K27",
        homeOdds: 1.01,
        awayOdds: 50,
        status: "Normal",
        mapOutcome: "home",
        outcomeKind: "price",
      }],
    });
    const hit = lookupPmMapOutcomeByToken("a");
    expect(hit?.mapOutcome).toBe("home");
    expect(pmMapOutcomeWinnerLabel(hit!, "Heroic", "K27")).toBe("Heroic");

    replacePmMapOutcomesFromIndex(null);
    expect(lookupPmMapOutcomeByToken("h")).toBeNull();
  });
});
