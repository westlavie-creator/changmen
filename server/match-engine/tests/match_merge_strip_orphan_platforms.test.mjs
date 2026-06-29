import { describe, expect, it } from "vitest";
import { stripOrphanClientMatchPlatforms } from "../merge/match_merge.js";

describe("stripOrphanClientMatchPlatforms", () => {
  it("removes Matchs and bet Sources when platform_match is gone from RDS snapshot", () => {
    const platformMatches = {
      IA: [{ SourceMatchID: "1", Home: "A", Away: "B" }],
    };
    const rows = [{
      ID: 697,
      Matchs: { IA: "1", OB: "5702887722893045" },
      Bets: [{
        Sources: {
          IA: { SourceBetID: "ia1" },
          OB: { SourceBetID: "ob1" },
        },
      }],
    }];
    stripOrphanClientMatchPlatforms(rows, platformMatches);
    expect(rows[0].Matchs).toEqual({ IA: "1" });
    expect(rows[0].Bets[0].Sources).toEqual({ IA: { SourceBetID: "ia1" } });
  });

  it("drops bets with no Sources left", () => {
    const rows = [{
      Matchs: { OB: "gone" },
      Bets: [{ Sources: { OB: { SourceBetID: "ob1" } } }],
    }];
    stripOrphanClientMatchPlatforms(rows, {});
    expect(rows[0].Matchs).toEqual({});
    expect(rows[0].Bets).toEqual([]);
  });
});
