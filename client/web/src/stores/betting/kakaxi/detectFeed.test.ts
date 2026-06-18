import { describe, expect, it, vi } from "vitest";
import {
  applyKakaxiDetectTransitions,
  mergeIncrementalKakaxiSnapshot,
} from "@/stores/betting/kakaxi/detectFeed";
import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";
import {
  clearKakaxiQueue,
  dequeueKakaxiBet,
  kakaxiQueueSize,
} from "@/stores/betting/kakaxi/queue";

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    matchs: [{ id: 100, bets: [{ id: 1, isLive: true }] }],
  }),
}));

const sampleOpp: ArbOpportunity = {
  scope: "funded",
  matchId: 100,
  betId: 1,
  matchTitle: "A vs B",
  betName: "R1",
  homePlatform: "OB",
  awayPlatform: "RAY",
  homeOdds: 2.1,
  awayOdds: 2.1,
  implied: 0.95,
};

describe("applyKakaxiDetectTransitions", () => {
  it("enqueues on appeared and removes on gone", () => {
    clearKakaxiQueue();
    applyKakaxiDetectTransitions([{ kind: "appeared", opportunity: sampleOpp }]);
    expect(kakaxiQueueSize()).toBe(1);

    applyKakaxiDetectTransitions([
      { kind: "gone", key: "100:1:OB:RAY", previous: sampleOpp },
    ]);
    expect(dequeueKakaxiBet()).toBeUndefined();
  });

  it("boosts implied on improved transition", () => {
    clearKakaxiQueue();
    applyKakaxiDetectTransitions([{ kind: "appeared", opportunity: sampleOpp }]);
    applyKakaxiDetectTransitions([
      {
        kind: "improved",
        opportunity: { ...sampleOpp, implied: 1.12 },
        previousImplied: 0.95,
      },
    ]);
    const next = dequeueKakaxiBet();
    expect(next?.implied).toBe(1.12);
  });
});

describe("mergeIncrementalKakaxiSnapshot", () => {
  it("only replaces dirty bet keys in snapshot", () => {
    const other = { ...sampleOpp, matchId: 200, betId: 2 };
    const prev = new Map([
      ["100:1:OB:RAY", sampleOpp],
      ["200:2:OB:RAY", other],
    ] as const);

    const merged = mergeIncrementalKakaxiSnapshot(prev, [], new Set(["100:1"]));

    expect(merged.has("100:1:OB:RAY")).toBe(false);
    expect(merged.get("200:2:OB:RAY")).toEqual(other);
  });
});
