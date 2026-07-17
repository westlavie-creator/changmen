/**
 * Map0 → 最后一图：对齐旧 matcher（仅决胜局 promote，投影阶段禁止填 Map=BO）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/sides/project_sources.js";
import { promoteMap0ToDecider } from "../src/shape/live_shape.js";
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

describe("map0 fallback vs decider map", () => {
  it("pre-decider: Map=BO without native must NOT get Map0 Sources", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3 } },
      RAY: { ray1: { ...pmRay, BO: 3 } },
    };
    // 全场 + 地图1 有原生；地图3 仅空壳（无有效 ID）→ 建壳但不允许 Map0 回填
    const bets = makeBets({
      OB: {
        0: rawOb,
        1: { ...rawOb, BetID: "ob-m1", HomeID: "ob-h1", AwayID: "ob-a1" },
        3: { ...rawOb, BetID: "ob-m3", HomeID: "", AwayID: "" },
      },
      RAY: {
        0: rawRay,
        1: { ...rawRay, BetID: "ray-m1", HomeID: "ray-h1", AwayID: "ray-a1" },
        3: { ...rawRay, BetID: "ray-m3", HomeID: "", AwayID: "" },
      },
    });
    const row = {
      ID: 1,
      Title: "NIP vs K27",
      BO: 3,
      Round: 1,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [
        { Map: 0, Sources: {} },
        { Map: 1, Sources: {} },
        { Map: 3, Sources: {} },
      ],
      Reverse: [],
    };
    // sticky / existing lock
    const existing = {
      id: 1,
      home_gb_team_id: GB_NIP,
      away_gb_team_id: GB_K27,
    };
    projectClientMatchSides(row, { matches, bets, existingRow: existing });

    const map0 = row.Bets.find(b => b.Map === 0);
    const map3 = row.Bets.find(b => b.Map === 3);
    assert.ok(map0.Sources.OB, "Map0 should have OB");
    assert.ok(map3, "Map=3 shell from empty native row");
    assert.deepEqual(Object.keys(map3.Sources || {}), [], "Map3 must not inherit Map0 before decider");
  });

  it("decider Round===BO: promote copies Map0 onto Map=BO", () => {
    installPlugin();
    const row = {
      ID: 2,
      Title: "NIP vs K27",
      BO: 3,
      Round: 3,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Reverse: [],
      Bets: [{
        Map: 0,
        Sources: {
          OB: { BetID: "ob-full", HomeID: "h", AwayID: "a", HomeOdds: 1.9, AwayOdds: 2.0 },
          RAY: { BetID: "ray-full", HomeID: "rh", AwayID: "ra", HomeOdds: 1.85, AwayOdds: 2.05 },
        },
      }],
    };
    promoteMap0ToDecider([row], {});
    const live = row.Bets.find(b => b.Map === 3);
    assert.ok(live);
    assert.equal(live.Sources.OB.BetID, "ob-full");
    assert.equal(live.Sources.RAY.BetID, "ray-full");
  });

  it("mid maps may still fallback Map0 when native missing", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3 } },
      RAY: { ray1: { ...pmRay, BO: 3 } },
    };
    const bets = makeBets({
      OB: {
        0: rawOb,
        1: { ...rawOb, BetID: "ob-m1", HomeID: "", AwayID: "" },
        3: { ...rawOb, BetID: "ob-m3", HomeID: "", AwayID: "" },
      },
      RAY: {
        0: rawRay,
        1: { ...rawRay, BetID: "ray-m1", HomeID: "", AwayID: "" },
        3: { ...rawRay, BetID: "ray-m3", HomeID: "", AwayID: "" },
      },
    });
    const row = {
      ID: 3,
      Title: "NIP vs K27",
      BO: 3,
      Round: 0,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [
        { Map: 0, Sources: {} },
        { Map: 1, Sources: {} },
        { Map: 3, Sources: {} },
      ],
      Reverse: [],
    };
    const existing = {
      id: 3,
      home_gb_team_id: GB_NIP,
      away_gb_team_id: GB_K27,
    };
    projectClientMatchSides(row, { matches, bets, existingRow: existing });
    const map1 = row.Bets.find(b => b.Map === 1);
    const map3 = row.Bets.find(b => b.Map === 3);
    assert.ok(map1?.Sources.OB, "Map1 may inherit Map0 (legacy mid-map fill)");
    assert.deepEqual(Object.keys(map3?.Sources || {}), [], "Map=BO still blocked");
  });
});
