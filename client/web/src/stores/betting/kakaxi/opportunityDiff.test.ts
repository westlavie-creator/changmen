import { describe, expect, it } from "vitest";
import {
  diffKakaxiOpportunities,
} from "@/stores/betting/kakaxi/opportunityDiff";
import { snapshotKakaxiOpportunities } from "@/stores/betting/kakaxi/opportunityDiff";
import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";

function makeOpp(patch: Partial<ArbOpportunity> = {}): ArbOpportunity {
  return {
    scope: "funded",
    matchId: 100,
    betId: 1,
    matchTitle: "A vs B",
    betName: "R1",
    homePlatform: "OB",
    awayPlatform: "RAY",
    homeOdds: 2.1,
    awayOdds: 2.1,
    implied: 1.05,
    ...patch,
  };
}

describe("diffKakaxiOpportunities", () => {
  it("emits appeared for new keys", () => {
    const opp = makeOpp();
    expect(diffKakaxiOpportunities(new Map(), [opp])).toEqual([
      { kind: "appeared", opportunity: opp },
    ]);
  });

  it("emits improved when implied rises enough", () => {
    const prev = makeOpp({ implied: 1.05 });
    const next = makeOpp({ implied: 1.08 });
    const transitions = diffKakaxiOpportunities(snapshotKakaxiOpportunities([prev]), [next]);
    expect(transitions).toEqual([
      { kind: "improved", opportunity: next, previousImplied: 1.05 },
    ]);
  });

  it("emits gone when key disappears", () => {
    const opp = makeOpp();
    const key = "100:1:OB:RAY" as const;
    const transitions = diffKakaxiOpportunities(snapshotKakaxiOpportunities([opp]), []);
    expect(transitions).toEqual([{ kind: "gone", key, previous: opp }]);
  });
});
