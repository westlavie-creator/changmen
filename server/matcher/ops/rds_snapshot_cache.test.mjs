import { describe, expect, it } from "vitest";
import { mergePlatformMatchesSnapshot } from "./rds_snapshot_cache.js";

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
});
