import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMatchListMerged,
  setTeamPlugin,
} from "../merge/match_merge.js";

function baseMatch(provider, sourceId, home, away, homeId, awayId, startTime = Date.now()) {
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

describe("buildMatchListMerged id phase", () => {
  beforeEach(() => {
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
  });

  it("does not block name merge when a platform is only in a solo ID group", () => {
    setTeamPlugin({
      lookupById(platform, platformId) {
        if (platform !== "OB")
          return null;
        const obMaps = { 100217: "100217", 100218: "100218" };
        return obMaps[String(platformId)] || null;
      },
    });

    const matches = {
      OB: {
        ob1: baseMatch("OB", "ob1", "Leviatán GC", "Daruma Synergy", "100217", "100218"),
      },
      RAY: {
        ray1: baseMatch("RAY", "ray1", "Leviatán GC", "Daruma Synergy", "200217", "200218"),
      },
      IA: {
        ia1: baseMatch("IA", "ia1", "Leviatán GC", "Daruma Synergy", "300217", "300218"),
      },
    };

    const list = buildMatchListMerged(matches, {}, {}, () => null);
    expect(list).toHaveLength(1);
    expect(list[0].MergeBasis).toBe("name");
    expect(Object.keys(list[0].Matchs).sort()).toEqual(["IA", "OB", "RAY"]);
  });
});
