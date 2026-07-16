/**
 * 回归：NiP vs K27 同边双开事故（2026-07-15）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/sides/project_sources.js";
import {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
} from "../src/invariants.js";
import {
  GB_K27,
  GB_NIP,
  installPlugin,
  makeBets,
  pmOb,
  pmRay,
  rawOb,
  rawRay,
} from "./fixtures.mjs";

function projectAccidentScenario(overrides = {}) {
  installPlugin();
  const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
  const bets = makeBets({
    OB: { 0: rawOb },
    RAY: { 0: rawRay },
  });
  const row = {
    ID: 1189,
    Matchs: { OB: "ob1", RAY: "ray1" },
    HomeGbTeamId: GB_K27,
    AwayGbTeamId: GB_NIP,
    Title: "K27 vs Ninjas in Pyjamas",
    Reverse: ["OB"],
    Bets: [{ Map: 0, Sources: {} }],
  };
  const result = projectClientMatchSides(row, {
    matches,
    bets,
    existingRow: {
      id: 1189,
      home_gb_team_id: GB_K27,
      away_gb_team_id: GB_NIP,
      title: "K27 vs Ninjas in Pyjamas",
    },
    platformOverrides: {
      1189: { RAY: "force_aligned", ...overrides },
    },
    stickyOrientation: true,
  });
  return { row, result, matches };
}

describe("NiP vs K27 accident regression (composer)", () => {
  it("both venues reverse under sticky flipped lock despite force_aligned", () => {
    const { row, result } = projectAccidentScenario();
    assert.ok(result.locked);
    assert.deepEqual([...row.Reverse].sort(), ["OB", "RAY"]);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-k27");
  });

  it("arb OB.Home + RAY.Away cannot both be K27", () => {
    const { row } = projectAccidentScenario();
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[0].Sources.RAY.AwayID, "roid-nip");
  });

  it("invariants hold", () => {
    const { row, matches } = projectAccidentScenario();
    const native = { "OB:0": rawOb, "RAY:0": rawRay };
    assert.equal(checkHomeSlotConsistency(row, native).ok, true);
    assert.equal(checkReverseSubsetOfSources(row).ok, true);
    assert.equal(checkNotSamePhysicalSide(row, {
      platformA: "OB",
      slotA: "Home",
      platformB: "RAY",
      slotB: "Away",
      nativeByPlatformMap: native,
      matches,
    }).ok, true);
  });

  it("default upgrade fixes dirty sticky lock when sticky off", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const bets = makeBets({ OB: { 0: rawOb }, RAY: { 0: rawRay } });
    const row = {
      ID: 1189,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Title: "K27 vs NiP",
      Bets: [{ Map: 0, Sources: {} }],
    };
    const result = projectClientMatchSides(row, {
      matches,
      bets,
      existingRow: {
        id: 1189,
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
      stickyOrientation: false,
    });
    assert.ok(result.locked);
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.equal(row.AwayGbTeamId, GB_K27);
    assert.deepEqual(row.Reverse, []);
  });
});
