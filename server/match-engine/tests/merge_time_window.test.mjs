import { beforeEach, describe, expect, it } from "vitest";
import { buildMatchListMerged, setTeamPlugin } from "../merge/match_merge.js";
import {
  MERGE_ID_START_TIME_TOLERANCE_MS,
  MERGE_START_TIME_TOLERANCE_MS,
} from "../merge/merge_constants.js";

const T0 = 1_700_000_000_000;
const CS2_OB = "257578064923863";
const CS2_RAY = "140";

function baseMatch(provider, sourceId, home, away, homeId, awayId, startTime = T0) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: homeId,
    AwayID: awayId,
    StartTime: startTime,
    SourceGameID: provider === "RAY" ? CS2_RAY : CS2_OB,
    BO: 3,
  };
}

describe("buildMatchListMerged start time window", () => {
  beforeEach(() => {
    setTeamPlugin(null);
  });

  it("does not merge same team names when start times exceed tolerance", () => {
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Team Alpha", "Team Beta", "1", "2", T0),
      },
      RAY: {
        ray1: baseMatch(
          "RAY",
          "ray1",
          "Team Alpha",
          "Team Beta",
          "3",
          "4",
          T0 + MERGE_START_TIME_TOLERANCE_MS + 60_000,
        ),
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(0);
  });

  it("merges same team names when start times are within tolerance", () => {
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Team Alpha", "Team Beta", "1", "2", T0),
      },
      RAY: {
        ray1: baseMatch(
          "RAY",
          "ray1",
          "Team Alpha",
          "Team Beta",
          "3",
          "4",
          T0 + MERGE_START_TIME_TOLERANCE_MS - 60_000,
        ),
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(1);
    expect(list[0].MergeBasis).toBe("name");
    expect(Object.keys(list[0].Matchs).sort()).toEqual(["OB", "RAY"]);
  });

  it("does not merge ID-mapped rows when start times exceed tolerance", () => {
    setTeamPlugin({
      lookupById(platform, platformId) {
        const maps = {
          "OB:100217": "100217",
          "OB:100218": "100218",
          "RAY:200217": "100217",
          "RAY:200218": "100218",
        };
        return maps[`${platform}:${platformId}`] || null;
      },
    });

    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Leviatán GC", "Daruma Synergy", "100217", "100218", T0),
      },
      RAY: {
        ray1: baseMatch(
          "RAY",
          "ray1",
          "Leviatán GC",
          "Daruma Synergy",
          "200217",
          "200218",
          T0 + MERGE_ID_START_TIME_TOLERANCE_MS + 60_000,
        ),
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(0);
  });

  it("merges ID-mapped rows within 60min name window via id basis when ids lock", () => {
    setTeamPlugin({
      lookupById(platform, platformId) {
        const maps = {
          "OB:100217": "100217",
          "OB:100218": "100218",
          "RAY:200217": "100217",
          "RAY:200218": "100218",
        };
        return maps[`${platform}:${platformId}`] || null;
      },
    });

    // 45min：落在 60min 名/ID 窗内；有 gb id 锁时走 id 合并
    const delta = 45 * 60 * 1000;
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Leviatán GC", "Daruma Synergy", "100217", "100218", T0),
      },
      RAY: {
        ray1: baseMatch(
          "RAY",
          "ray1",
          "Leviatán GC",
          "Daruma Synergy",
          "200217",
          "200218",
          T0 + delta,
        ),
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(1);
    expect(list[0].MergeBasis).toBe("id");
    expect(Object.keys(list[0].Matchs).sort()).toEqual(["OB", "RAY"]);
  });

  it("name-merges Polymarket-like 40min start skew within 60min window", () => {
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "CYBERSHOKE Esports", "Team Comanche", "1", "2", T0),
      },
      Polymarket: {
        pm1: {
          ...baseMatch(
            "OB",
            "pm1",
            "CYBERSHOKE Esports",
            "Team Comanche",
            "pm-h",
            "pm-a",
            T0 + 40 * 60 * 1000,
          ),
          SourceGameID: "cs2",
        },
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0].Matchs).sort()).toEqual(["OB", "Polymarket"]);
  });

  it("does not name-merge when either platform lacks start time", () => {
    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Team Alpha", "Team Beta", "1", "2", T0),
      },
      RAY: {
        ray1: {
          ...baseMatch("RAY", "ray1", "Team Alpha", "Team Beta", "3", "4", 0),
          StartTime: 0,
        },
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(0);
  });
});
