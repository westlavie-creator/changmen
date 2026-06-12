import { describe, expect, it } from "vitest";
import { applyManualMatchLinks } from "../merge/match_merge.js";

const src = (p, b) => ({
  Type: p,
  BetID: String(b.SourceBetID),
  HomeID: String(b.SourceHomeID || ""),
  AwayID: String(b.SourceAwayID || ""),
  HomeOdds: b.HomeOdds,
  AwayOdds: b.AwayOdds,
  Status: b.Status || "Normal",
});

function baseMatch(provider, sourceId, clientMatchId) {
  return {
    SourceMatchID: sourceId,
    Home: "ex-RUBY",
    Away: "G2 Ares",
    StartTime: Date.now(),
    SourceGameID: "8",
    BO: 3,
    match_id: clientMatchId,
  };
}

describe("applyManualMatchLinks", () => {
  it("merges new map bets when platform was already linked", () => {
    const obId = "ob-1";
    const rayId = "ray-1";
    const clientId = 318;

    const matches = {
      OB: { [obId]: baseMatch("OB", obId, clientId) },
      RAY: { [rayId]: baseMatch("RAY", rayId, clientId) },
    };

    const bets = {
      [`OB:${obId}`]: {
        provider: "OB",
        matchId: obId,
        bets: [
          { SourceBetID: "ob0", Map: 0, BetName: "[全场]-全局-获胜", HomeOdds: 1.5, AwayOdds: 2.5, Status: "Normal" },
          { SourceBetID: "ob1", Map: 1, BetName: "[地图1]-单局-获胜", HomeOdds: 1.6, AwayOdds: 2.4, Status: "Normal" },
          { SourceBetID: "ob2", Map: 2, BetName: "[地图2]-单局-获胜", HomeOdds: 1.7, AwayOdds: 2.3, Status: "Normal" },
          { SourceBetID: "ob3", Map: 3, BetName: "[地图3]-单局-获胜", HomeOdds: 1.8, AwayOdds: 2.2, Status: "Normal" },
        ],
      },
      [`RAY:${rayId}`]: {
        provider: "RAY",
        matchId: rayId,
        bets: [
          { SourceBetID: "ray0", Map: 0, BetName: "[全场] 获胜者", HomeOdds: 1.5, AwayOdds: 2.5, Status: "Normal" },
          { SourceBetID: "ray1", Map: 1, BetName: "[地图1] 获胜者", HomeOdds: 1.6, AwayOdds: 2.4, Status: "Normal" },
          { SourceBetID: "ray2", Map: 2, BetName: "[地图2] 获胜者", HomeOdds: 1.7, AwayOdds: 2.3, Status: "Normal" },
        ],
      },
    };

    const existingClientRows = [
      {
        id: clientId,
        title: "ex-RUBY vs G2 Ares",
        game: "CS:GO",
        matchs: { OB: obId, RAY: rayId },
        bets: [
          { Map: 0, Name: "[全场]-全局-获胜", Sources: { OB: { BetID: "ob0" }, RAY: { BetID: "ray0" } } },
          { Map: 1, Name: "[地图1]-单局-获胜", Sources: { OB: { BetID: "ob1" }, RAY: { BetID: "ray1" } } },
          { Map: 2, Name: "[地图2]-单局-获胜", Sources: { OB: { BetID: "ob2" }, RAY: { BetID: "ray2" } } },
        ],
      },
    ];

    const result = applyManualMatchLinks([], matches, bets, {}, src, existingClientRows);
    const row = result.find((m) => Number(m.ID) === clientId);
    expect(row).toBeTruthy();
    expect(row.Bets.map((b) => b.Map).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(row.Bets.find((b) => b.Map === 3)?.Sources?.OB?.BetID).toBe("ob3");
  });
});
