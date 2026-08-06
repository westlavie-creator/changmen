import { describe, expect, it } from "vitest";
import { mergeBetsSnapshotRdsTruth, mergePlatformMatchesSnapshot } from "./rds_snapshot_cache.js";

describe("mergePlatformMatchesSnapshot", () => {
  it("preserves RDS ClientMatchId when hot collector row lacks link", () => {
    const rds = {
      IA: [{ SourceMatchID: "375079", Home: "A", ClientMatchId: 683 }],
      TF: [{ SourceMatchID: "739844653", Home: "B", ClientMatchId: 683 }],
    };
    const hot = {
      IA: [{ SourceMatchID: "375079", Home: "A", savedAt: Date.now() }],
    };
    const merged = mergePlatformMatchesSnapshot(rds, hot);
    expect(merged.IA[0].ClientMatchId).toBe(683);
    expect(merged.TF[0].ClientMatchId).toBe(683);
  });

  it("does not resurrect hot rows missing from RDS", () => {
    const rds = {
      IA: [{ SourceMatchID: "1", Home: "A" }],
    };
    const hot = {
      OB: [{ SourceMatchID: "5702887722893045", Home: "U", Away: "F" }],
      IA: [{ SourceMatchID: "1", Home: "A refreshed" }],
    };
    const merged = mergePlatformMatchesSnapshot(rds, hot);
    expect(merged.OB).toBeUndefined();
    expect(merged.IA).toHaveLength(1);
    expect(merged.IA[0].Home).toBe("A refreshed");
  });

  it("prefers RDS ClientMatchId when hot collector carries a different link", () => {
    const rds = {
      RAY: [{ SourceMatchID: "38403932", Home: "BB Team", Away: "BIG", ClientMatchId: 51 }],
    };
    const hot = {
      RAY: [{ SourceMatchID: "38403932", Home: "BB Team", Away: "BIG", ClientMatchId: 99, savedAt: Date.now() }],
    };
    const merged = mergePlatformMatchesSnapshot(rds, hot);
    expect(merged.RAY[0].ClientMatchId).toBe(51);
  });
});

describe("mergeBetsSnapshotRdsTruth", () => {
  it("drops hot bets when platform_match was removed from RDS", () => {
    const rdsMatches = { OB: [{ SourceMatchID: "1" }] };
    const rdsBets = { "OB:1": { bets: [{ SourceBetID: "b1" }] } };
    const hotBets = {
      "OB:1": { bets: [{ SourceBetID: "b1-new" }] },
      "OB:gone": { bets: [{ SourceBetID: "b2" }] },
    };
    const merged = mergeBetsSnapshotRdsTruth(rdsBets, hotBets, rdsMatches);
    expect(merged["OB:1"].bets[0].SourceBetID).toBe("b1-new");
    expect(merged["OB:gone"]).toBeUndefined();
  });
});
