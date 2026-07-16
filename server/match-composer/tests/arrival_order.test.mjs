/**
 * 各馆陆续到齐：多 tick 时序 + 对冲不变式。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/sides/project_sources.js";
import {
  checkNotSamePhysicalSide,
  checkSourcesMatchLockTeams,
} from "../src/invariants.js";
import {
  GB_K27,
  GB_NIP,
  installPlugin,
  makeBets,
  pmOb,
  pmPm,
  pmRay,
  pmRayFlipped,
  rawOb,
  rawPm,
  rawRay,
  rawRayFlipped,
} from "./fixtures.mjs";

function persist(row) {
  return {
    id: row.ID,
    home_gb_team_id: row.HomeGbTeamId ?? null,
    away_gb_team_id: row.AwayGbTeamId ?? null,
    title: row.Title,
  };
}

function tick(state, { matchs, matches, betTable, overrides = {}, stickyOrientation } = {}) {
  installPlugin();
  const row = {
    ID: state.id,
    Matchs: matchs,
    Bets: [{ Map: 0, Sources: {} }],
    Title: state.title || "",
  };
  const result = projectClientMatchSides(row, {
    matches,
    bets: makeBets(betTable),
    existingRow: state.existing,
    platformOverrides: { [state.id]: overrides },
    stickyOrientation,
  });
  state.existing = persist(row);
  state.title = row.Title;
  state.last = { row, result, matches };
  return state.last;
}

describe("arrival order (composer)", () => {
  it("RAY flipped then OB arrives → upgrade, no Reverse", () => {
    const state = { id: 5001, existing: null };

    let { row, result } = tick(state, {
      matchs: { RAY: "ray1" },
      matches: { RAY: { ray1: pmRayFlipped } },
      betTable: { RAY: { 0: rawRayFlipped } },
    });
    assert.equal(result.lockSource, "RAY");
    assert.equal(row.HomeGbTeamId, GB_K27);

    ({ row, result } = tick(state, {
      matchs: { RAY: "ray1", OB: "ob1" },
      matches: { RAY: { ray1: pmRayFlipped }, OB: { ob1: pmOb } },
      betTable: { RAY: { 0: rawRayFlipped }, OB: { 0: rawOb } },
    }));
    assert.ok(String(result.lockSource).includes("upgrade") || result.lockSource === "OB"
      || String(result.lockSource).startsWith("upgrade"));
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.equal(row.AwayGbTeamId, GB_K27);
    assert.ok(row.Reverse.includes("RAY"));
    assert.ok(!row.Reverse.includes("OB"));
  });

  it("sticky keeps flipped lock until reanchor; force_aligned ignored when auto reversed", () => {
    const state = {
      id: 5002,
      existing: {
        id: 5002,
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
    };
    const { row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      betTable: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
      overrides: { RAY: "force_aligned" },
      stickyOrientation: true,
    });
    assert.deepEqual([...row.Reverse].sort(), ["OB", "RAY"]);
    const hedge = checkNotSamePhysicalSide(row, {
      platformA: "OB",
      slotA: "Home",
      platformB: "RAY",
      slotB: "Away",
      nativeByPlatformMap: { "OB:0": rawOb, "RAY:0": rawRay },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
    });
    assert.equal(hedge.ok, true);
  });

  it("Polymarket + OB + RAY lock home slots map to GB_NIP", () => {
    installPlugin();
    const matches = {
      Polymarket: { pm1: pmPm },
      OB: { ob1: pmOb },
      RAY: { ray1: pmRayFlipped },
    };
    const row = {
      ID: 9,
      Matchs: { Polymarket: "pm1", OB: "ob1", RAY: "ray1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    const result = projectClientMatchSides(row, {
      matches,
      bets: makeBets({
        Polymarket: { 0: rawPm },
        OB: { 0: rawOb },
        RAY: { 0: rawRayFlipped },
      }),
    });
    assert.ok(result.locked);
    assert.equal(row.HomeGbTeamId, GB_NIP);
    const lockCheck = checkSourcesMatchLockTeams(row, {
      matches,
      nativeByPlatformMap: {
        "Polymarket:0": rawPm,
        "OB:0": rawOb,
        "RAY:0": rawRayFlipped,
      },
    });
    assert.equal(lockCheck.ok, true, lockCheck.violations?.join("; "));
  });
});
