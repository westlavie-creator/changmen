import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";
import { describe, expect, it, vi } from "vitest";
import {
  applyKakaxiDetectTransitions,
  mergeIncrementalKakaxiSnapshot,
} from "@/stores/betting/kakaxi/detectFeed";
import {
  clearKakaxiQueue,
  dequeueKakaxiBet,
  kakaxiQueueSize,
} from "@/stores/betting/kakaxi/queue";

const wakeKakaxiDrain = vi.fn();

vi.mock("@/stores/betting/kakaxi/drainWake", () => ({
  wakeKakaxiDrain: (urgent?: boolean) => wakeKakaxiDrain(urgent),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => matchStoreState,
}));

const matchStoreState = {
  matchs: [{ id: 100, bets: [{ id: 1, isLive: true }] }],
};

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
    wakeKakaxiDrain.mockClear();
    applyKakaxiDetectTransitions([{ kind: "appeared", opportunity: sampleOpp }]);
    expect(kakaxiQueueSize()).toBe(1);
    expect(wakeKakaxiDrain).toHaveBeenCalledWith(true);

    wakeKakaxiDrain.mockClear();
    applyKakaxiDetectTransitions([
      { kind: "gone", key: "100:1:OB:RAY", previous: sampleOpp },
    ]);
    expect(dequeueKakaxiBet()).toBeUndefined();
    expect(wakeKakaxiDrain).not.toHaveBeenCalled();
  });

  it("boosts implied on improved transition", () => {
    clearKakaxiQueue();
    wakeKakaxiDrain.mockClear();
    applyKakaxiDetectTransitions([{ kind: "appeared", opportunity: sampleOpp }]);
    wakeKakaxiDrain.mockClear();
    applyKakaxiDetectTransitions([
      {
        kind: "improved",
        opportunity: { ...sampleOpp, implied: 1.12 },
        previousImplied: 0.95,
      },
    ]);
    const next = dequeueKakaxiBet();
    expect(next?.implied).toBe(1.12);
    expect(wakeKakaxiDrain).toHaveBeenCalledWith(true);
  });

  it("does not wake on prematch improved boost only", () => {
    matchStoreState.matchs = [{ id: 100, bets: [{ id: 1, isLive: false }] }];
    clearKakaxiQueue();
    wakeKakaxiDrain.mockClear();
    const prematchOpp = { ...sampleOpp, implied: 0.95 };
    applyKakaxiDetectTransitions([{ kind: "appeared", opportunity: prematchOpp }]);
    wakeKakaxiDrain.mockClear();
    applyKakaxiDetectTransitions([
      {
        kind: "improved",
        opportunity: { ...prematchOpp, implied: 1.12 },
        previousImplied: 0.95,
      },
    ]);
    expect(dequeueKakaxiBet()?.implied).toBe(1.12);
    expect(wakeKakaxiDrain).not.toHaveBeenCalled();
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
