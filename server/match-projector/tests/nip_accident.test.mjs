/**
 * 回归：NiP vs K27 同边双开事故（2026-07-15）。
 *
 * 症状：Title 成 K27 vs NiP；OB Sources 已 swap；RAY 因 force_aligned 未 swap
 * → 两边腿都落到 K27。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/project_side_sources.js";
import {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
} from "../src/invariants.js";
import {
  GB_K27,
  GB_NIP,
  installPlugin,
  makeAccumulate,
  pmOb,
  pmRay,
  rawOb,
  rawRay,
} from "./fixtures.mjs";

function projectAccidentScenario(overrides = {}) {
  installPlugin();
  const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
  const row = {
    ID: 1189,
    Matchs: { OB: "ob1", RAY: "ray1" },
    // 旧 finalize / min/max 写反到 row 上 —— 投影必须忽略
    HomeGbTeamId: GB_K27,
    AwayGbTeamId: GB_NIP,
    Title: "K27 vs Ninjas in Pyjamas",
    Reverse: ["OB"], // 旧 Reverse 残缺
    Bets: [{
      Map: 0,
      Sources: {
        OB: { ...rawOb, HomeID: "oid-k27", AwayID: "oid-nip" }, // 已 swap 残盘
        RAY: { ...rawRay }, // 未 swap 残盘
      },
    }],
  };
  const result = projectClientMatchSides(row, {
    matches,
    bets: {},
    timers: {},
    sourceFromBet: () => ({}),
    buildAccumulateRow: makeAccumulate({
      OB: { 0: rawOb },
      RAY: { 0: rawRay },
    }),
    existingRow: {
      id: 1189,
      home_gb_team_id: GB_K27,
      away_gb_team_id: GB_NIP,
      title: "K27 vs Ninjas in Pyjamas",
    },
    platformOverrides: {
      1189: { RAY: "force_aligned", ...overrides },
    },
    // 事故态：RDS 已写成翻转锁；显式 sticky 以复现「未 upgrade」路径
    stickyOrientation: true,
  });
  return { row, result };
}

describe("NiP vs K27 accident regression", () => {
  it("both venues reverse under sticky flipped lock despite force_aligned", () => {
    const { row, result } = projectAccidentScenario();
    assert.ok(result.locked);
    assert.deepEqual([...row.Reverse].sort(), ["OB", "RAY"]);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-k27");
    assert.equal(row.Bets[0].Sources.OB.AwayID, "oid-nip");
    assert.equal(row.Bets[0].Sources.RAY.AwayID, "roid-nip");
  });

  it("arb OB.Home + RAY.Away cannot both be K27 oids", () => {
    const { row } = projectAccidentScenario();
    // 事故形态：OB Home=K27 oid 且 RAY Away=K27 oid
    const obHome = row.Bets[0].Sources.OB.HomeID;
    const rayAway = row.Bets[0].Sources.RAY.AwayID;
    assert.equal(obHome, "oid-k27");
    assert.notEqual(rayAway, "roid-k27");
    assert.equal(rayAway, "roid-nip");
  });

  it("invariants: I1 + Reverse subset + not same physical side", () => {
    const { row } = projectAccidentScenario();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
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

  it("without existing sticky: row pollution discarded → OB native lock → no Reverse", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = {
      ID: 1189,
      Matchs: { OB: "ob1", RAY: "ray1" },
      HomeGbTeamId: GB_K27,
      AwayGbTeamId: GB_NIP,
      Bets: [{ Map: 0, Sources: {} }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({
        OB: { 0: rawOb },
        RAY: { 0: rawRay },
      }),
      existingRow: null,
      platformOverrides: { 1189: { RAY: "force_aligned" } },
    });
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.deepEqual(row.Reverse, []);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-nip");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-nip");
  });

  it("default upgrade (no sticky) restores NiP-home and clears Reverse", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = {
      ID: 1189,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({
        OB: { 0: rawOb },
        RAY: { 0: rawRay },
      }),
      existingRow: {
        id: 1189,
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
    });
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.match(row.Title, /^Ninjas in Pyjamas vs K27$/);
    assert.deepEqual(row.Reverse, []);
  });

  it("decider map stays empty in projector when only Map0 native (promote elsewhere)", () => {
    const { row, result } = (() => {
      installPlugin();
      const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
      const r = {
        ID: 1189,
        Matchs: { OB: "ob1", RAY: "ray1" },
        Bets: [
          { Map: 0, Sources: {} },
          { Map: 3, Sources: {} },
        ],
      };
      const result = projectClientMatchSides(r, {
        matches,
        bets: {},
        timers: {},
        sourceFromBet: () => ({}),
        buildAccumulateRow: makeAccumulate({
          OB: { 0: rawOb },
          RAY: { 0: rawRay },
        }),
        existingRow: {
          id: 1189,
          home_gb_team_id: GB_K27,
          away_gb_team_id: GB_NIP,
        },
        platformOverrides: { 1189: { RAY: "force_aligned" } },
        stickyOrientation: true,
      });
      return { row: r, result };
    })();
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-k27");
    assert.deepEqual(Object.keys(row.Bets[1].Sources || {}), [], "Map3 not filled by projector");
    assert.ok(result.omitted.some(o => o.reason === "no_map0_fallback_on_map_line"));
    assert.deepEqual([...row.Reverse].sort(), ["OB", "RAY"]);
  });
});
