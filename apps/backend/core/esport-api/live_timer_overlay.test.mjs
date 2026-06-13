import { describe, expect, it } from "vitest";
import {
  liveRound,
  mergeTimerBlocks,
  overlayLiveTimersOnMatches,
} from "./live_timer_overlay.js";

describe("mergeTimerBlocks", () => {
  it("empty memory snapshot overrides stale RDS rows for that platform", () => {
    const merged = mergeTimerBlocks(
      { OB: { provider: "OB", timer: [] } },
      { OB: { provider: "OB", timer: [{ MatchID: "1", Round: 4, StartTime: 1000 }] } },
    );
    expect(merged.OB.timer).toEqual([]);
  });
});

describe("overlayLiveTimersOnMatches", () => {
  const baseMatch = {
    ID: 1,
    Round: 4,
    RoundStart: 5000,
    Matchs: { OB: "99" },
    Bets: [],
  };

  it("clears stale Round when OB snapshot omits ended match", () => {
    const out = overlayLiveTimersOnMatches([baseMatch], {
      OB: { provider: "OB", timer: [{ MatchID: "2", Round: 1, StartTime: 1000 }] },
    });
    expect(out[0].Round).toBe(0);
    expect(out[0].RoundStart).toBe(0);
  });

  it("keeps live Round when match is in OB snapshot", () => {
    const out = overlayLiveTimersOnMatches([baseMatch], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 4, StartTime: 8000 }] },
    });
    expect(out[0].Round).toBe(4);
    expect(out[0].RoundStart).toBe(8000);
  });

  it("leaves match unchanged when no timer snapshot for linked platforms", () => {
    const out = overlayLiveTimersOnMatches([baseMatch], {});
    expect(out[0].Round).toBe(4);
  });
});

describe("liveRound", () => {
  it("returns zero when match id not in timer batch", () => {
    expect(
      liveRound({ OB: { timer: [{ MatchID: "1", Round: 2, StartTime: 1 }] } }, "OB", "9"),
    ).toEqual({ round: 0, roundStart: 0 });
  });
});
