import { describe, expect, it } from "vitest";
import {
  computeRecommendations,
  dashboardRowsFromSnapshot,
  isPlatformMatchLinkedForRec,
} from "./matcher_data.js";

const T0 = Date.parse("2026-08-08T01:45:00+08:00");

function row(overrides = {}) {
  return {
    platform: "Polymarket",
    source_match_id: "800206",
    source_game_id: "lol",
    start_time: T0,
    home: "Team Heretics",
    home_id: "lol:team-heretics",
    away: "Fnatic",
    away_id: "lol:fnatic",
    match_id: null,
    bound_client_match_id: null,
    ...overrides,
  };
}

describe("isPlatformMatchLinkedForRec", () => {
  it("treats bound_client_match_id as linked even when active client list is empty", () => {
    const m = row({ bound_client_match_id: 1259, match_id: null });
    expect(isPlatformMatchLinkedForRec(m, [])).toBe(true);
  });

  it("still links via visible multi-platform client_matches.matchs", () => {
    const m = row({ match_id: null, bound_client_match_id: null });
    const cms = [{
      id: 10,
      matchs: { Polymarket: "800206", PredictFun: "281786" },
    }];
    expect(isPlatformMatchLinkedForRec(m, cms)).toBe(true);
  });
});

describe("computeRecommendations", () => {
  it("drops groups already bound to an ended client_match", () => {
    const matches = [
      row({
        platform: "Polymarket",
        source_match_id: "800206",
        bound_client_match_id: 1259,
        match_id: null,
      }),
      row({
        platform: "PredictFun",
        source_match_id: "281786",
        bound_client_match_id: 1259,
        match_id: null,
      }),
    ];
    expect(computeRecommendations(matches, [])).toEqual([]);
  });

  it("keeps unbound cross-platform name/time candidates", () => {
    const matches = [
      row({ platform: "Polymarket", source_match_id: "800206" }),
      row({ platform: "PredictFun", source_match_id: "281786" }),
    ];
    const recs = computeRecommendations(matches, []);
    expect(recs).toHaveLength(1);
    expect(recs[0].platforms.sort()).toEqual(["Polymarket", "PredictFun"]);
  });
});

describe("dashboardRowsFromSnapshot", () => {
  it("keeps bound_client_match_id when client_match is no longer active", () => {
    const matchesRaw = {
      Polymarket: {
        800206: {
          SourceMatchID: "800206",
          SourceGameID: "lol",
          StartTime: T0,
          Home: "Team Heretics",
          HomeID: "lol:team-heretics",
          Away: "Fnatic",
          AwayID: "lol:fnatic",
          ClientMatchId: 1259,
        },
      },
      PredictFun: {
        281786: {
          SourceMatchID: "281786",
          SourceGameID: "lol",
          StartTime: T0,
          Home: "Team Heretics",
          HomeID: "lol:team-heretics",
          Away: "Fnatic",
          AwayID: "lol:fnatic",
          match_id: 1259,
        },
      },
    };
    // ended CM not in active snapshot
    const rows = dashboardRowsFromSnapshot(matchesRaw, []);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.match_id).toBeNull();
      expect(r.bound_client_match_id).toBe(1259);
    }
    expect(computeRecommendations(rows, [])).toEqual([]);
  });

  it("passes PB rot_num through snapshot rows", () => {
    const matchesRaw = {
      PB: {
        1633928872: {
          SourceMatchID: "1633928872",
          SourceGameID: "cs2",
          StartTime: T0,
          Home: "Spirit",
          Away: "NAVI",
          RotNum: "31832",
        },
      },
    };
    const rows = dashboardRowsFromSnapshot(matchesRaw, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].rot_num).toBe("31832");
    expect(rows[0].source_match_id).toBe("1633928872");
  });
});
