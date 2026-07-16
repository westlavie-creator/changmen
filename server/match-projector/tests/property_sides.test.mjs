/**
 * 组合属性：多馆 × 锁朝向 × override → Home/Away 槽不得同边。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/project_side_sources.js";
import {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
  checkSourcesMatchLockTeams,
} from "../src/invariants.js";
import {
  GB_K27,
  GB_NIP,
  installPlugin,
  makeAccumulate,
  pmOb,
  pmRay,
  pmRayFlipped,
  rawOb,
  rawRay,
  rawRayFlipped,
} from "./fixtures.mjs";

const LOCKS = [
  { name: "nip-home", home: GB_NIP, away: GB_K27 },
  { name: "k27-home", home: GB_K27, away: GB_NIP },
];

const RAY_VARIANTS = [
  { name: "ray-aligned-native", pm: pmRay, raw: rawRay },
  { name: "ray-flipped-native", pm: pmRayFlipped, raw: rawRayFlipped },
];

/** force_reversed 是人工强翻，可故意不跟锁；对冲不变式只覆盖自动/force_aligned */
const OVERRIDES = [
  undefined,
  "force_aligned",
  { mode: "force_aligned" },
];

describe("property: never same physical side on Home+Away arb", () => {
  for (const lock of LOCKS) {
    for (const ray of RAY_VARIANTS) {
      for (const ov of OVERRIDES) {
        const ovLabel = ov == null ? "none" : typeof ov === "string" ? ov : `obj:${ov.mode}`;
        it(`lock=${lock.name} ${ray.name} ov=${ovLabel}`, () => {
          installPlugin();
          const matches = { OB: { ob1: pmOb }, RAY: { ray1: ray.pm } };
          const row = {
            ID: 9001,
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
              RAY: { 0: ray.raw },
            }),
            existingRow: {
              id: 9001,
              home_gb_team_id: lock.home,
              away_gb_team_id: lock.away,
            },
            // 属性覆盖「给定锁朝向」下的投影，显式 sticky 避免被 OB upgrade 掉
            stickyOrientation: true,
            platformOverrides: ov
              ? { 9001: { RAY: ov } }
              : {},
          });

          const src = row.Bets[0].Sources || {};
          if (!src.OB || !src.RAY)
            return;

          const native = { "OB:0": rawOb, "RAY:0": ray.raw };
          const i1 = checkHomeSlotConsistency(row, native);
          assert.equal(i1.ok, true, i1.violations.join("; "));
          assert.equal(checkReverseSubsetOfSources(row).ok, true);

          const hedge = checkNotSamePhysicalSide(row, {
            platformA: "OB",
            slotA: "Home",
            platformB: "RAY",
            slotB: "Away",
            nativeByPlatformMap: native,
            matches,
          });
          assert.equal(hedge.ok, true, hedge.violations.join("; "));

          const hedge2 = checkNotSamePhysicalSide(row, {
            platformA: "OB",
            slotA: "Away",
            platformB: "RAY",
            slotB: "Home",
            nativeByPlatformMap: native,
            matches,
          });
          assert.equal(hedge2.ok, true, hedge2.violations.join("; "));

          const lockSlots = checkSourcesMatchLockTeams(row, {
            matches,
            nativeByPlatformMap: native,
          });
          assert.equal(lockSlots.ok, true, lockSlots.violations.join("; "));
        });
      }
    }
  }
});

describe("force_reversed is opt-in and must still satisfy I1", () => {
  it("OB aligned + RAY force_reversed → I1 holds, Reverse=[RAY]", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = {
      ID: 9003,
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
        id: 9003,
        home_gb_team_id: GB_NIP,
        away_gb_team_id: GB_K27,
      },
      platformOverrides: { 9003: { RAY: "force_reversed" } },
    });
    assert.deepEqual(row.Reverse, ["RAY"]);
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-k27");
    const i1 = checkHomeSlotConsistency(row, { "OB:0": rawOb, "RAY:0": rawRay });
    assert.equal(i1.ok, true, i1.violations.join("; "));
  });
});

describe("property: three platforms OB+RAY+IA under flipped sticky", () => {
  it("IA also reverses; all HomeIDs are K27-side oids", () => {
    installPlugin();
    const pmIa = {
      SourceMatchID: "ia1",
      Home: "NiP",
      Away: "K27",
      HomeID: "ia-nip",
      AwayID: "ia-k27",
      SourceGameID: "3",
    };
    const rawIa = {
      Type: "IA",
      BetID: "i0",
      HomeID: "iaoid-nip",
      AwayID: "iaoid-k27",
      HomeOdds: 1.4,
      AwayOdds: 2.6,
      Status: "Normal",
    };
    const matches = {
      OB: { ob1: pmOb },
      RAY: { ray1: pmRay },
      IA: { ia1: pmIa },
    };
    const row = {
      ID: 9002,
      Matchs: { OB: "ob1", RAY: "ray1", IA: "ia1" },
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
        IA: { 0: rawIa },
      }),
      existingRow: {
        id: 9002,
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
      platformOverrides: { 9002: { RAY: "force_aligned" } },
      stickyOrientation: true,
    });
    assert.deepEqual([...row.Reverse].sort(), ["IA", "OB", "RAY"]);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-k27");
    assert.equal(row.Bets[0].Sources.IA.HomeID, "iaoid-k27");
  });
});
