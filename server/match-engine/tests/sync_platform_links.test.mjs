import { describe, expect, it } from "vitest";
import {
  applyManualMatchLinks,
  syncClientMatchsFromDbBindings,
  syncClientMatchsFromPlatformLinks,
} from "../merge/match_merge.js";

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

describe("syncClientMatchsFromDbBindings", () => {
  it("adds platform from RDS bindings when match snapshot lacks ClientMatchId", () => {
    const rows = [{
      ID: 51,
      Title: "BB Team vs BIG",
      Matchs: { IA: "375372", OB: "5739386475295487", TF: "743284578" },
      Bets: [{ Map: 0, Sources: { IA: { BetID: "1" } } }],
    }];
    const bindings = new Map([[51, [
      { platform: "RAY", source_match_id: "38403932" },
    ]]]);
    const matches = {
      RAY: {
        "38403932": {
          SourceMatchID: "38403932",
          Home: "BB Team",
          Away: "BIG",
          StartTime: 1,
          SourceGameID: "140",
        },
      },
    };
    syncClientMatchsFromDbBindings(rows, bindings, matches, {}, {}, () => null);
    expect(rows[0].Matchs.RAY).toBe("38403932");
  });
});

describe("applyManualMatchLinks sync after finalize", () => {
  it("keeps RAY on client row when only RDS bindings carry the link", () => {
    const mergedList = [];
    const existingClientRows = [{
      id: 51,
      title: "BB Team vs BIG",
      game_id: "3",
      start_time: 1,
      matchs: { IA: "375372", OB: "5739386475295487", TF: "743284578" },
      bets: [],
      round: 0,
      bo: 3,
      reverse: [],
    }];
    const matches = {
      IA: { ia1: { SourceMatchID: "375372", Home: "BB Team", Away: "BIG", StartTime: 1, SourceGameID: "3" } },
      OB: { ob1: { SourceMatchID: "5739386475295487", Home: "BB Team", Away: "BIG", StartTime: 1, SourceGameID: "x" } },
      TF: { tf1: { SourceMatchID: "743284578", Home: "BB", Away: "BIG", StartTime: 1, SourceGameID: "1" } },
      RAY: { ray1: { SourceMatchID: "38403932", Home: "BB Team", Away: "BIG", StartTime: 1, SourceGameID: "140" } },
    };
    const bindings = new Map([[51, [
      { platform: "IA", source_match_id: "375372" },
      { platform: "OB", source_match_id: "5739386475295487" },
      { platform: "TF", source_match_id: "743284578" },
      { platform: "RAY", source_match_id: "38403932" },
    ]]]);
    const out = applyManualMatchLinks(mergedList, matches, {}, {}, () => null, existingClientRows, {}, bindings);
    expect(out).toHaveLength(1);
    expect(out[0].Matchs.RAY).toBe("38403932");
  });
});

describe("applyManualMatchLinks sync after finalize (memory ClientMatchId)", () => {
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
