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
    const map0 = out[0].Bets.find(b => b.Map === 0);
    expect(map0?.Sources).toEqual({
      OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
    });
    expect(map0?.InitialHomeOdds).toBe(1.9);
    expect(map0?.InitialAwayOdds).toBe(3.33);
    const map3 = out[0].Bets.find(b => b.Map === 3);
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
    const map0 = out[0].Bets.find(b => b.Map === 0);
    const map3 = out[0].Bets.find(b => b.Map === 3);
    expect(map0?.Sources).toEqual({
      OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
    });
    expect(map3?.Sources?.RAY).toMatchObject({ BetID: "9", HomeOdds: 1.9, AwayOdds: 1.84 });
  });

  it("overlay promote keeps reconciled RAY odds when Reverse includes RAY", () => {
    const match = {
      ID: 1,
      BO: 3,
      Round: 0,
      RoundStart: 0,
      Reverse: ["RAY"],
      Title: "9z Team vs FURIA",
      Matchs: { OB: "99", RAY: "88" },
      Bets: [
        {
          Map: 0,
          HomeName: "9z Team",
          AwayName: "FURIA",
          Sources: {
            OB: {
              Type: "OB",
              BetID: "1",
              HomeOdds: 2.5,
              AwayOdds: 1.55,
              Status: "Normal",
            },
            RAY: {
              Type: "RAY",
              BetID: "9",
              HomeOdds: 2.08,
              AwayOdds: 1.85,
              Status: "Normal",
            },
          },
        },
        {
          Map: 3,
          HomeName: "9z Team",
          AwayName: "FURIA",
          Sources: {
            OB: {
              Type: "OB",
              BetID: "2",
              HomeOdds: 2.065,
              AwayOdds: 1.75,
              Status: "Normal",
            },
          },
        },
      ],
    };
    const out = overlayLiveTimersOnMatches([match], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 3, StartTime: 8000 }] },
    });
    const map3 = out[0].Bets.find(b => b.Map === 3);
    expect(map3?.Sources?.RAY).toMatchObject({ HomeOdds: 2.08, AwayOdds: 1.85 });
  });

  it("keeps Map=0 with empty Sources when live and OB has no full-match market", () => {
    const match = {
      ID: 1,
      BO: 3,
      Round: 0,
      RoundStart: 0,
      Matchs: { OB: "99", RAY: "88", IA: "77" },
      Bets: [
        {
          Map: 0,
          Status: "Normal",
          Sources: {
            RAY: { Type: "RAY", BetID: "9", HomeOdds: 1.01, AwayOdds: 12.52, Status: "Normal" },
            IA: { Type: "IA", BetID: "8", HomeOdds: 1.02, AwayOdds: 11.22, Status: "Normal" },
          },
        },
        {
          Map: 2,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 1.1, AwayOdds: 6, Status: "Normal" },
          },
        },
      ],
    };
    const out = overlayLiveTimersOnMatches([match], {
      OB: { provider: "OB", timer: [{ MatchID: "99", Round: 2, StartTime: 8000 }] },
    });
    const map0 = out[0].Bets.find(b => b.Map === 0);
    expect(map0?.Sources).toEqual({});
    expect(map0?.InitialHomeOdds).toBe(1.02);
    expect(map0?.InitialAwayOdds).toBe(12.52);
  });

  it("restores Map=0 from platform bets when DB row omitted it", () => {
    const match = {
      ID: 167,
      BO: 3,
      Round: 0,
      RoundStart: 0,
      Matchs: { OB: "ob1", RAY: "ray1", IA: "ia1" },
      Bets: [
        {
          Map: 2,
          Status: "Normal",
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 1.1, AwayOdds: 6, Status: "Normal" },
          },
        },
      ],
    };
    const enrich = {
      matches: {
        OB: { ob1: { SourceMatchID: "ob1", Home: "A", Away: "B", BO: 3, IsLive: 2 } },
        RAY: { ray1: { SourceMatchID: "ray1", Home: "A", Away: "B", BO: 3 } },
        IA: { ia1: { SourceMatchID: "ia1", Home: "A", Away: "B", BO: 3 } },
      },
      bets: {
        "RAY:ray1": {
          provider: "RAY",
          matchId: "ray1",
          bets: [
            {
              SourceBetID: "ray0",
              Map: 0,
              BetName: "[全场] 获胜者",
              SourceHomeID: "h",
              SourceAwayID: "a",
              HomeOdds: 1.01,
              AwayOdds: 12.52,
              Status: "Normal",
            },
          ],
        },
        "IA:ia1": {
          provider: "IA",
          matchId: "ia1",
          bets: [
            {
              SourceBetID: "ia0",
              Map: 0,
              BetName: "[全场] 获胜",
              SourceHomeID: "h",
              SourceAwayID: "a",
              HomeOdds: 1.02,
              AwayOdds: 11.22,
              Status: "Normal",
            },
          ],
        },
      },
      sourceFromBet: (p, b) => ({
        Type: p,
        BetID: String(b.SourceBetID),
        HomeID: String(b.SourceHomeID),
        AwayID: String(b.SourceAwayID),
        HomeOdds: b.HomeOdds,
        AwayOdds: b.AwayOdds,
        Status: b.Status,
      }),
    };
    const out = overlayLiveTimersOnMatches(
      [match],
      { OB: { provider: "OB", timer: [{ MatchID: "ob1", Round: 2, StartTime: 8000 }] } },
      enrich,
    );
    const map0 = out[0].Bets.find(b => b.Map === 0);
    expect(map0?.Sources).toEqual({});
    expect(map0?.InitialHomeOdds).toBe(1.02);
    expect(map0?.InitialAwayOdds).toBe(12.52);
    expect(out[0].Bets.map(b => b.Map)).toEqual([0, 2]);
  });

  it("promotes RAY to decider Map when DB Map=0 was trimmed to OB only", () => {
    const match = {
      ID: 1,
      BO: 3,
      Round: 3,
      RoundStart: 8000,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [
        {
          Map: 0,
          Sources: {
            OB: { Type: "OB", BetID: "1", HomeOdds: 1.3, AwayOdds: 3.33, Status: "Normal" },
          },
        },
        {
          Map: 3,
          Sources: {
            OB: { Type: "OB", BetID: "2", HomeOdds: 1.84, AwayOdds: 1.9, Status: "Normal" },
          },
        },
      ],
    };
    const enrich = {
      matches: {
        OB: { ob1: { SourceMatchID: "ob1", Home: "A", Away: "B", BO: 3, IsLive: 2 } },
        RAY: { ray1: { SourceMatchID: "ray1", Home: "A", Away: "B", BO: 3 } },
      },
      bets: {
        "RAY:ray1": {
          provider: "RAY",
          matchId: "ray1",
          bets: [
            {
              SourceBetID: "ray-final",
              Map: 0,
              BetName: "[全场] 获胜者",
              SourceHomeID: "h",
              SourceAwayID: "a",
              HomeOdds: 1.9,
              AwayOdds: 1.84,
              Status: "Normal",
            },
          ],
        },
      },
      sourceFromBet: (p, b) => ({
        Type: p,
        BetID: String(b.SourceBetID),
        HomeID: String(b.SourceHomeID),
        AwayID: String(b.SourceAwayID),
        HomeOdds: b.HomeOdds,
        AwayOdds: b.AwayOdds,
        Status: b.Status,
      }),
    };
    const out = overlayLiveTimersOnMatches(
      [match],
      { OB: { provider: "OB", timer: [{ MatchID: "ob1", Round: 3, StartTime: 8000 }] } },
      enrich,
    );
    const map3 = out[0].Bets.find(b => b.Map === 3);
    expect(map3?.Sources?.RAY).toMatchObject({ BetID: "ray-final", HomeOdds: 1.9 });
    const map0 = out[0].Bets.find(b => b.Map === 0);
    expect(Object.keys(map0?.Sources || {})).toEqual(["OB"]);
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
