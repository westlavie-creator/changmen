import { describe, expect, it } from "vitest";
import { buildComposerExplain } from "../ui/build_explain.js";

describe("buildComposerExplain", () => {
  it("标注依据与过程", () => {
    const explain = buildComposerExplain({
      builtAt: 1,
      wrote: false,
      endedCount: 2,
      info: [{
        ID: 42,
        Title: "NiP vs K27",
        Game: "CS2",
        StartTime: 1_700_000_000_000,
        MergeKey: "match:id:nip-k27",
        Matchs: { OB: "ob1", RAY: "ray1" },
        Reverse: ["RAY"],
        _clusterBasis: "id",
        _lockAnchor: "ob",
        _lockSource: "ob",
        _omitEvents: [{ platform: "IA", map: 0, reason: "ambiguous" }],
        Bets: [{
          Map: 0,
          Sources: {
            OB: { HomeName: "NiP", AwayName: "K27" },
            RAY: { HomeName: "K27", AwayName: "NiP" },
          },
        }],
      }],
      projectStats: { locked: 1, unlocked: 0, omitEvents: 1 },
      alignStats: { aligned: 3 },
    }, { previousActiveIds: [42] });

    expect(explain.matchCount).toBe(1);
    expect(explain.matches[0].clusterBasis).toBe("id");
    expect(explain.matches[0].reusedId).toBe(true);
    expect(explain.matches[0].process).toHaveLength(5);
    expect(explain.matches[0].process[0].detail).toMatch(/gb/);
    expect(explain.matches[0].lockLabel).toMatch(/OB/);
    expect(explain.basisCount.id).toBe(1);
  });

  it("徽章以 MergeKey 前缀为准纠正 id/name", async () => {
    const { resolveDisplayBasis } = await import("../ui/build_explain.js");
    expect(resolveDisplayBasis({
      MergeKey: "match:id:8:100715:100829",
      _clusterBasis: "name",
    })).toBe("id");
    expect(resolveDisplayBasis({
      MergeKey: "match:name:8:gentle mates:pcific",
      _clusterBasis: "id",
    })).toBe("name");
    expect(resolveDisplayBasis({
      MergeKey: "match:id:x",
      _clusterBasis: "seed",
    })).toBe("seed");
  });
});
