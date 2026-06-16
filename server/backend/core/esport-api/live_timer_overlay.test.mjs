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

  it("keeps stored Round in overlay when OB snapshot omits match (gate clears later)", () => {
    const out = overlayLiveTimersOnMatches([baseMatch], {
      OB: { provider: "OB", timer: [{ MatchID: "2", Round: 1, StartTime: 1000 }] },
    });
    expect(out[0].Round).toBe(4);
    expect(out[0].RoundStart).toBe(5000);
    const gated = applyObLiveGate(
      out,
      { OB: { 99: { IsLive: 2 } } },
      { OB: { timer: [{ MatchID: "2", Round: 1, StartTime: 1000 }] } },
    );
    expect(gated[0].Round).toBe(0);
    expect(gated[0].RoundStart).toBe(0);
  });

  it("keeps live Round when match is in OB snapshot", () => {
    const out = overlayLiveTimersOnMatches([baseMatch], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 4, StartTime: 8000 }] },
    });
    expect(out[0].Round).toBe(4);
    expect(out[0].RoundStart).toBe(8000);
  });

  it("trims Map=0 to OB only when overlay sets live Round", () => {
    const match = {
      ID: 1,
      BO: 3,
      Round: 0,
      RoundStart: 0,
      Matchs: { OB: "99", RAY: "88" },
      Bets: [
        {
          Map: 0,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
            RAY: { Type: "RAY", BetID: "9", HomeOdds: 1.9, AwayOdds: 1.8, Status: "Normal" },
          },
        },
        {
          Map: 3,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 1.84, AwayOdds: 1.9, Status: "Normal" },
            RAY: { Type: "RAY", BetID: "3", HomeOdds: 1.87, AwayOdds: 1.87, Status: "Normal" },
          },
        },
      ],
    };
    const out = overlayLiveTimersOnMatches([match], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 3, StartTime: 8000 }] },
    });
    expect(out[0].Round).toBe(3);
    const map0 = out[0].Bets.find((b) => b.Map === 0);
    expect(map0?.Sources).toEqual({
      OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
    });
    expect(map0?.InitialHomeOdds).toBe(1.9);
    expect(map0?.InitialAwayOdds).toBe(3.33);
    const map3 = out[0].Bets.find((b) => b.Map === 3);
    expect(map3?.Sources?.RAY?.BetID).toBe("3");
  });

  it("promotes Map=0 to Map=3 on BO3 decider via overlay", () => {
    const match = {
      ID: 1,
      BO: 3,
      Round: 0,
      RoundStart: 0,
      Matchs: { OB: "99", RAY: "88" },
      Bets: [
        {
          Map: 0,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
            RAY: { Type: "RAY", BetID: "9", HomeOdds: 1.9, AwayOdds: 1.84, Status: "Normal" },
          },
        },
        {
          Map: 3,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 1.84, AwayOdds: 1.9, Status: "Normal" },
          },
        },
      ],
    };
    const out = overlayLiveTimersOnMatches([match], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 3, StartTime: 8000 }] },
    });
    const map0 = out[0].Bets.find((b) => b.Map === 0);
    const map3 = out[0].Bets.find((b) => b.Map === 3);
    expect(map0?.Sources).toEqual({
      OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
    });
    expect(map3?.Sources?.RAY).toMatchObject({ BetID: "9", HomeOdds: 1.9, AwayOdds: 1.84 });
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
