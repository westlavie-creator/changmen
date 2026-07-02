import { describe, expect, it } from "vitest";
import { applyManualMatchLinks, syncClientMatchsFromPlatformLinks } from "../merge/match_merge.js";

describe("syncClientMatchsFromPlatformLinks", () => {
  it("adds platform to client Matchs when platform row has match_id but client row is stale", () => {
    const rows = [{
      ID: 36,
      Title: "DYG vs RW",
      Matchs: { IA: "374858", RAY: "38401991" },
      Bets: [{ Map: 0, Sources: { IA: { BetID: "1" }, RAY: { BetID: "2" } } }],
    }];
    const matches = {
      OB: {
        ob1: {
          SourceMatchID: "5512662302086001",
          Home: "DYG",
          Away: "济南RW侠",
          ClientMatchId: 36,
          StartTime: 1,
          SourceGameID: "257561197207055",
        },
      },
    };
    syncClientMatchsFromPlatformLinks(rows, matches, {}, {}, () => null);
    expect(rows[0].Matchs).toEqual({
      IA: "374858",
      RAY: "38401991",
      OB: "5512662302086001",
    });
  });
});

describe("applyManualMatchLinks sync after finalize", () => {
  it("keeps OB on client row when platform match_id points to client id", () => {
    const mergedList = [];
    const existingClientRows = [{
      id: 36,
      title: "DYG vs RW",
      game_id: "4",
      start_time: 1,
      matchs: { IA: "374858", RAY: "38401991" },
      bets: [],
      round: 1,
      bo: 5,
      reverse: [],
    }];
    const matches = {
      IA: { ia1: { SourceMatchID: "374858", Home: "深圳DYG", Away: "济南RW侠", ClientMatchId: 36, StartTime: 1, SourceGameID: "16" } },
      RAY: { ray1: { SourceMatchID: "38401991", Home: "深圳DYG", Away: "济南RW侠", ClientMatchId: 36, StartTime: 1, SourceGameID: "74" } },
      OB: { ob1: { SourceMatchID: "5512662302086001", Home: "DYG", Away: "济南RW侠", ClientMatchId: 36, StartTime: 1, SourceGameID: "257561197207055", BO: 5 } },
    };
    const out = applyManualMatchLinks(mergedList, matches, {}, {}, () => null, existingClientRows, {});
    expect(out).toHaveLength(1);
    expect(out[0].Matchs.OB).toBe("5512662302086001");
  });
});
