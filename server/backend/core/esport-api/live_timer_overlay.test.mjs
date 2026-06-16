import { describe, expect, it } from "vitest";
import {
  applyObLiveGate,
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

  it("clears Round when OB snapshot omits ended match", () => {
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

  it("neutralizes Map=0 sources when overlay Round equals BO (decider)", () => {
    const match = {
      ID: 1,
      BO: 5,
      Round: 0,
      RoundStart: 0,
      Matchs: { OB: "99" },
      Bets: [
        {
          Map: 0,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "1", HomeOdds: 1.9, AwayOdds: 1.8, Status: "Normal" },
          },
        },
        {
          Map: 5,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 2.1, AwayOdds: 1.7, Status: "Normal" },
          },
        },
      ],
    };
    const out = overlayLiveTimersOnMatches([match], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 5, StartTime: 8000 }] },
    });
    expect(out[0].Round).toBe(5);
    const map0 = out[0].Bets.find((b) => b.Map === 0);
    const map5 = out[0].Bets.find((b) => b.Map === 5);
    expect(map0?.Status).toBe("Locked");
    expect(map0?.Sources?.OB).toMatchObject({
      BetID: "1",
      HomeOdds: 0,
      AwayOdds: 0,
      Status: "Locked",
    });
    expect(map5?.Sources?.OB?.Status).toBe("Normal");
  });

  it("keeps Round when no timer snapshot exists (await matcher or next SaveLiveTimer)", () => {
    const out = overlayLiveTimersOnMatches([baseMatch], {});
    expect(out[0].Round).toBe(4);
    expect(out[0].RoundStart).toBe(5000);
  });
});

describe("applyObLiveGate", () => {
  const baseMatch = {
    ID: 1,
    Round: 4,
    RoundStart: 5000,
    Matchs: { OB: "99" },
    Bets: [],
  };

  it("clears stale Round when is_live=1", () => {
    const out = applyObLiveGate(
      [baseMatch],
      { OB: { 99: { IsLive: 1 } } },
      { OB: { timer: [{ MatchID: "2", Round: 1, StartTime: 1000 }] } },
    );
    expect(out[0].Round).toBe(0);
    expect(out[0].RoundStart).toBe(0);
  });

  it("clears when match dropped from OB timer batch", () => {
    const out = applyObLiveGate(
      [baseMatch],
      { OB: { 99: { IsLive: 2 } } },
      { OB: { timer: [{ MatchID: "2", Round: 1, StartTime: 1000 }] } },
    );
    expect(out[0].Round).toBe(0);
    expect(out[0].RoundStart).toBe(0);
  });

  it("clears when OB timer batch is empty", () => {
    const out = applyObLiveGate(
      [baseMatch],
      { OB: { 99: { IsLive: 2 } } },
      { OB: { timer: [] } },
    );
    expect(out[0].Round).toBe(0);
    expect(out[0].RoundStart).toBe(0);
  });

  it("clears when match no longer in OB index snapshot", () => {
    const out = applyObLiveGate(
      [baseMatch],
      { OB: {} },
      { OB: { timer: [] } },
    );
    expect(out[0].Round).toBe(0);
    expect(out[0].RoundStart).toBe(0);
  });

  it("keeps Round when is_live=2 and still in timer batch", () => {
    const out = applyObLiveGate(
      [baseMatch],
      { OB: { 99: { IsLive: 2 } } },
      { OB: { timer: [{ MatchID: "99", Round: 4, StartTime: 8000 }] } },
    );
    expect(out[0].Round).toBe(4);
    expect(out[0].RoundStart).toBe(5000);
  });
});
