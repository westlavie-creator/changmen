/**
 * Map0 → 局盘：禁止投影回填；仅 Round===BO 时决胜局用 Map0 作投影输入。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/sides/project_sources.js";
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

describe("map0 fallback vs map lines", () => {
  it("pre-decider: Map=BO without native must NOT get Map0 Sources", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3 } },
      RAY: { ray1: { ...pmRay, BO: 3 } },
    };
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

  it("decider Round===OB.BO: Map=BO projects from Map0 native", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3 } },
      RAY: { ray1: { ...pmRay, BO: 0 } },
    };
    const bets = makeBets({ OB: { 0: rawOb }, RAY: { 0: rawRay } });
    const row = {
      ID: 2,
      Title: "NIP vs K27",
      Round: 3,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Reverse: [],
      Bets: [],
    };
    const existing = { id: 2, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 };
    projectClientMatchSides(row, { matches, bets, existingRow: existing });

    const live = row.Bets.find(b => b.Map === 3);
    assert.ok(live, "decider shell must exist in periods");
    assert.equal(live.Sources.OB.BetID, rawOb.BetID);
    assert.equal(live.Sources.RAY.BetID, rawRay.BetID);
    const map0 = row.Bets.find(b => b.Map === 0);
    assert.equal(live.Sources.OB.HomeID, map0.Sources.OB.HomeID, "no second swap");
  });

  it("mid maps must NOT fallback Map0 when native missing (PB-only-full case)", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3 } },
      RAY: { ray1: { ...pmRay, BO: 3 } },
    };
    const bets = makeBets({
      OB: {
        0: rawOb,
        1: { ...rawOb, BetID: "ob-m1", HomeID: "", AwayID: "" },
        2: { ...rawOb, BetID: "ob-m2", HomeID: "ob-h2", AwayID: "ob-a2" },
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
      Round: 2,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [
        { Map: 0, Sources: {} },
        { Map: 1, Sources: {} },
        { Map: 2, Sources: {} },
        { Map: 3, Sources: {} },
      ],
      Reverse: [],
    };
    const existing = {
      id: 3,
      home_gb_team_id: GB_NIP,
      away_gb_team_id: GB_K27,
    };
    const result = projectClientMatchSides(row, { matches, bets, existingRow: existing });
    const map1 = row.Bets.find(b => b.Map === 1);
    const map2 = row.Bets.find(b => b.Map === 2);
    const map3 = row.Bets.find(b => b.Map === 3);
    assert.deepEqual(Object.keys(map1?.Sources || {}), [], "Map1 must not inherit Map0");
    assert.ok(map2?.Sources.OB, "OB native Map2 kept");
    assert.equal(map2?.Sources.RAY, undefined, "RAY missing Map2 must not get Map0 copy");
    assert.deepEqual(Object.keys(map3?.Sources || {}), [], "Map=BO still blocked pre-promote");
    assert.ok(
      result.omitted.some(o => o.reason === "no_map0_fallback_on_map_line" && o.map === 2),
      "should record mid-map omit when Map0 was available",
    );
  });
});
