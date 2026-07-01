import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMatchListObSpine, setTeamPlugin } from "../merge/match_merge.js";

const T0 = 1_700_000_000_000;

function baseMatch(provider, sourceId, home, away, homeId, awayId, startTime = T0) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: homeId,
    AwayID: awayId,
    StartTime: startTime,
    SourceGameID: "8",
    BO: 3,
  };
}

describe("buildMatchListObSpine", () => {
  beforeEach(() => {
    setTeamPlugin(null);
  });

  afterEach(() => {
    delete process.env.MATCHER_OB_SPINE_MERGE;
  });

  it("merges non-OB platforms onto OB spine rows by team name", () => {
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Team Alpha", "Team Beta", "1", "2", T0),
        ob2: baseMatch("OB", "ob2", "Team Alpha", "Team Beta", "1", "2", T0 + 3_600_000),
      },
      RAY: {
        r1: baseMatch("RAY", "r1", "Team Alpha", "Team Beta", "10", "20", T0 + 60_000),
        r2: baseMatch("RAY", "r2", "Team Alpha", "Team Beta", "10", "20", T0 + 3_600_000 + 60_000),
      },
    };

    const list = buildMatchListObSpine(matches, {}, {}, () => null);
    expect(list).toHaveLength(2);
    for (const row of list) {
      expect(row.Matchs.OB).toBeTruthy();
      expect(row.Matchs.RAY).toBeTruthy();
      expect(row.MergeKey.startsWith("ob-spine:")).toBe(true);
    }
    const byOb = Object.fromEntries(list.map(r => [r.Matchs.OB, r.Matchs.RAY]));
    expect(byOb.ob1).toBe("r1");
    expect(byOb.ob2).toBe("r2");
  });

  it("falls back to standard merge for matches without OB", () => {
    const matches = {
      RAY: {
        r1: baseMatch("RAY", "r1", "Team Alpha", "Team Beta", "10", "20", T0),
      },
      PB: {
        p1: baseMatch("PB", "p1", "Team Alpha", "Team Beta", "30", "40", T0),
      },
    };

    const list = buildMatchListObSpine(matches, {}, {}, () => null);
    expect(list).toHaveLength(1);
    expect(list[0].Matchs.RAY).toBe("r1");
    expect(list[0].Matchs.PB).toBe("p1");
    expect(list[0].MergeKey.startsWith("ob-spine:")).toBe(false);
  });

  it("does not attach when start times exceed tolerance", () => {
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Team Alpha", "Team Beta", "1", "2", T0),
      },
      RAY: {
        r1: baseMatch("RAY", "r1", "Team Alpha", "Team Beta", "10", "20", T0 + 3_600_000),
      },
    };

    const list = buildMatchListObSpine(matches, {}, {}, () => null);
    expect(list).toHaveLength(0);
  });
});
