import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMatcherBehaviorConfig,
  resetMatcherBehaviorConfig,
} from "../matcher_behavior.js";
import {
  buildClientMatchListFromRegistry,
  isRegistryMaterializeEnabled,
  setTeamPlugin,
} from "../merge/match_merge.js";

const T0 = 1_700_000_000_000;

function baseMatch(provider, sourceId, home, away, homeId, awayId, startTime = T0) {
  return {
    SourceMatchID: sourceId,
    Home: home,
    Away: away,
    HomeID: homeId,
    AwayID: awayId,
    StartTime: startTime,
    SourceGameID: "8",
    BO: 3,
  };
}

function src() {
  return (_provider, b) => ({
    Type: _provider,
    BetID: String(b.SourceBetID || "b1"),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: "1.90",
    AwayOdds: "1.90",
    Status: "Normal",
  });
}

describe("buildClientMatchListFromRegistry", () => {
  beforeEach(() => {
    setTeamPlugin(null);
    resetMatcherBehaviorConfig();
  });

  afterEach(() => {
    resetMatcherBehaviorConfig();
  });

  it("isRegistryMaterializeEnabled requires eventRegistry", () => {
    applyMatcherBehaviorConfig({ registryMaterialize: true, eventRegistry: false });
    expect(isRegistryMaterializeEnabled()).toBe(false);

    applyMatcherBehaviorConfig({ eventRegistry: true, registryMaterialize: true });
    expect(isRegistryMaterializeEnabled()).toBe(true);
  });

  it("assembles multi-platform rows from bindings with stable event id", () => {
    const matches = {
      OB: { 101: baseMatch("OB", "101", "T1", "GEN", "h1", "a1") },
      RAY: { 202: baseMatch("RAY", "202", "T1", "GEN", "h1", "a1") },
      TF: { 303: baseMatch("TF", "303", "Alpha", "Beta", "x1", "y1") },
      PB: { 404: baseMatch("PB", "404", "Alpha", "Beta", "x1", "y1") },
    };
    const bindings = [
      {
        platform: "OB",
        source_match_id: "101",
        event_id: 42,
        binding_source: "manual",
        binding_side_mode: "aligned",
      },
      {
        platform: "RAY",
        source_match_id: "202",
        event_id: 42,
        binding_source: "manual",
        binding_side_mode: "aligned",
      },
    ];
    const matchEventsById = new Map([[
      42,
      {
        id: 42,
        event_anchor: "OB:101",
        home_gb_team_id: 10,
        away_gb_team_id: 20,
      },
    ]]);

    const list = buildClientMatchListFromRegistry({
      bindings,
      matchEventsById,
      matches,
      bets: {},
      timers: {},
      sourceFromBet: src(),
    });

    const registryRow = list.find(r => r.ID === 42);
    expect(registryRow).toBeTruthy();
    expect(registryRow.Matchs).toEqual({ OB: "101", RAY: "202" });
    expect(registryRow.MergeBasis).toBe("id");
    expect(registryRow.HomeGbTeamId).toBe("10");
    expect(registryRow.AwayGbTeamId).toBe("20");

    const fallbackRow = list.find(r => r.Matchs?.TF === "303" && r.Matchs?.PB === "404");
    expect(fallbackRow).toBeTruthy();
    expect(fallbackRow.ID).toBeUndefined();
  });

  it("skips registry rows with fewer than two resolvable platforms", () => {
    const matches = {
      OB: { 1: baseMatch("OB", "1", "A", "B", "h", "a") },
    };
    const bindings = [
      {
        platform: "OB",
        source_match_id: "1",
        event_id: 9,
        binding_source: "manual",
        binding_side_mode: "aligned",
      },
    ];

    const list = buildClientMatchListFromRegistry({
      bindings,
      matchEventsById: new Map([[9, { id: 9, event_anchor: "OB:1" }]]),
      matches,
      bets: {},
      timers: {},
      sourceFromBet: src(),
    });

    expect(list.find(r => r.ID === 9)).toBeUndefined();
  });
});
