/**
 * Map0 → 局盘：禁止投影回填；仅 Round===BO 时决胜局用 Map0 作投影输入。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { checkHomeSlotConsistency, checkReverseSubsetOfSources } from "../compose/invariants.js";
import { applyLiveShape } from "../compose/shape/live_shape.js";
import { projectClientMatchSides } from "../compose/sides/project_sources.js";
import { resolveMatchStructure } from "../compose/structure/resolve_structure.js";
import {
  GB_K27,
  GB_NIP,
  installPlugin,
  makeBets,
  pmOb,
  pmPm,
  pmPf,
  pmRay,
  rawOb,
  rawPm,
  rawPf,
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

describe("Polymarket Map0 exclusive on decider", () => {
  function projectPmRow({ round, withOb = true, isLive = 2 }) {
    installPlugin();
    const matches = {
      ...(withOb ? { OB: { ob1: { ...pmOb, BO: 3, IsLive: isLive } } } : {}),
      Polymarket: { pm1: { ...pmPm } },
      RAY: { ray1: { ...pmRay } },
    };
    const bets = makeBets({
      ...(withOb ? { OB: { 0: rawOb } } : {}),
      Polymarket: { 0: rawPm },
      RAY: { 0: rawRay },
    });
    const row = {
      ID: 20,
      Title: "NIP vs K27",
      Round: round,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: {
        ...(withOb ? { OB: "ob1" } : {}),
        Polymarket: "pm1",
        RAY: "ray1",
      },
      Reverse: [],
      Bets: [],
    };
    const existing = { id: 20, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 };
    projectClientMatchSides(row, { matches, bets, existingRow: existing });
    return { row, matches };
  }

  it("Round===OB.BO: PM only on decider, stripped from Map0", () => {
    const { row } = projectPmRow({ round: 3 });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.ok(map3?.Sources?.Polymarket, "decider keeps PM full-match copy");
    assert.equal(map3.Sources.Polymarket.BetID, rawPm.BetID);
    assert.equal(map0?.Sources?.Polymarket, undefined, "Map0 must not keep the same PM token");
    assert.ok(map0?.Sources?.OB, "OB remains on Map0");
    const rev = checkReverseSubsetOfSources(row);
    assert.equal(rev.ok, true, rev.violations.join("; "));
    const i1 = checkHomeSlotConsistency(row, {
      "OB:0": rawOb,
      "RAY:0": rawRay,
      "Polymarket:0": rawPm,
    });
    assert.equal(i1.ok, true, i1.violations.join("; "));
  });

  it("Round!==BO: PM stays on Map0, no Map0 copy on map 3", () => {
    const { row } = projectPmRow({ round: 2 });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.ok(map0?.Sources?.Polymarket, "pre-decider Map0 keeps PM");
    assert.equal(map3?.Sources?.Polymarket, undefined);
  });

  it("native PM Map=3: keep Map0 moneyline; do not strip", () => {
    installPlugin();
    const nativeMap3 = { ...rawPm, BetID: "p3", HomeID: "pmid-m3h", AwayID: "pmid-m3a" };
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3, IsLive: 2 } },
      Polymarket: { pm1: { ...pmPm } },
    };
    const bets = makeBets({
      OB: { 0: rawOb },
      Polymarket: { 0: rawPm, 3: nativeMap3 },
    });
    const row = {
      ID: 23,
      Title: "NIP vs K27",
      Round: 3,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", Polymarket: "pm1" },
      Reverse: [],
      Bets: [],
    };
    projectClientMatchSides(row, {
      matches,
      bets,
      existingRow: { id: 23, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 },
    });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.equal(map0?.Sources?.Polymarket?.BetID, rawPm.BetID, "native map line must not strip Map0");
    assert.equal(map3?.Sources?.Polymarket?.BetID, "p3");
  });

  it("BO5 Round=5: PM on Map=5 only; Round=3 is not decider", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 5, IsLive: 2 } },
      Polymarket: { pm1: { ...pmPm } },
    };
    const bets = makeBets({ OB: { 0: rawOb }, Polymarket: { 0: rawPm } });
    const existing = { id: 22, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 };
    const mid = {
      ID: 22,
      Title: "NIP vs K27",
      Round: 3,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", Polymarket: "pm1" },
      Reverse: [],
      Bets: [],
    };
    projectClientMatchSides(mid, { matches, bets, existingRow: existing });
    assert.ok(mid.Bets.find(b => (Number(b.Map) || 0) === 0)?.Sources?.Polymarket);
    assert.equal(mid.Bets.find(b => Number(b.Map) === 5)?.Sources?.Polymarket, undefined);

    const last = {
      ...mid,
      Round: 5,
      Bets: [],
    };
    projectClientMatchSides(last, { matches, bets, existingRow: existing });
    assert.equal(last.Bets.find(b => (Number(b.Map) || 0) === 0)?.Sources?.Polymarket, undefined);
    assert.ok(last.Bets.find(b => Number(b.Map) === 5)?.Sources?.Polymarket);
  });

  it("no OB: Round=3 does not copy or strip PM", () => {
    const { row } = projectPmRow({ round: 3, withOb: false });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    assert.ok(map0?.Sources?.Polymarket, "without OB.BO there is no decider");
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.equal(map3?.Sources?.Polymarket, undefined);
  });

  it("applyLiveShape after strip does not put PM back on Map0", () => {
    const { row, matches } = projectPmRow({ round: 3 });
    applyLiveShape([row], { matches });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.equal(map0?.Sources?.Polymarket, undefined);
    assert.ok(map3?.Sources?.Polymarket);
  });

  it("OB not live clears Round so Map0 keeps PM", () => {
    installPlugin();
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3, IsLive: 1 } },
      Polymarket: { pm1: { ...pmPm } },
    };
    const bets = makeBets({
      OB: { 0: rawOb },
      Polymarket: { 0: rawPm },
    });
    const rows = [{
      ID: 21,
      Title: "NIP vs K27",
      Round: 3,
      RoundStart: 1,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", Polymarket: "pm1" },
      Reverse: [],
      Bets: [],
    }];
    resolveMatchStructure(rows, { matches, timers: {}, bets });
    assert.equal(rows[0].Round, 0);
    assert.equal(rows[0]._deciderMap, 0);
    projectClientMatchSides(rows[0], {
      matches,
      bets,
      existingRow: { id: 21, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 },
    });
    const map0 = rows[0].Bets.find(b => (Number(b.Map) || 0) === 0);
    assert.ok(map0?.Sources?.Polymarket);
  });
});

describe("PredictFun Map0 exclusive on decider", () => {
  function projectPfRow({ round, withOb = true, isLive = 2 }) {
    installPlugin();
    const matches = {
      ...(withOb ? { OB: { ob1: { ...pmOb, BO: 3, IsLive: isLive } } } : {}),
      PredictFun: { pf1: { ...pmPf } },
      RAY: { ray1: { ...pmRay } },
    };
    const bets = makeBets({
      ...(withOb ? { OB: { 0: rawOb } } : {}),
      PredictFun: { 0: rawPf },
      RAY: { 0: rawRay },
    });
    const row = {
      ID: 30,
      Title: "NIP vs K27",
      Round: round,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: {
        ...(withOb ? { OB: "ob1" } : {}),
        PredictFun: "pf1",
        RAY: "ray1",
      },
      Reverse: [],
      Bets: [],
    };
    const existing = { id: 30, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 };
    projectClientMatchSides(row, { matches, bets, existingRow: existing });
    return { row, matches };
  }

  it("Round===OB.BO: PF only on decider, stripped from Map0", () => {
    const { row } = projectPfRow({ round: 3 });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.ok(map3?.Sources?.PredictFun, "decider keeps PF full-match copy");
    assert.equal(map3.Sources.PredictFun.BetID, rawPf.BetID);
    assert.equal(map0?.Sources?.PredictFun, undefined, "Map0 must not keep the same PF token");
    assert.ok(map0?.Sources?.OB, "OB remains on Map0");
    const rev = checkReverseSubsetOfSources(row);
    assert.equal(rev.ok, true, rev.violations.join("; "));
    const i1 = checkHomeSlotConsistency(row, {
      "OB:0": rawOb,
      "RAY:0": rawRay,
      "PredictFun:0": rawPf,
    });
    assert.equal(i1.ok, true, i1.violations.join("; "));
  });

  it("Round!==BO: PF stays on Map0, no Map0 copy on map 3", () => {
    const { row } = projectPfRow({ round: 2 });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.ok(map0?.Sources?.PredictFun, "pre-decider Map0 keeps PF");
    assert.equal(map3?.Sources?.PredictFun, undefined);
  });

  it("native PF Map=3: keep Map0 moneyline; do not strip", () => {
    installPlugin();
    const nativeMap3 = { ...rawPf, BetID: "pf3", HomeID: "pfid-m3h", AwayID: "pfid-m3a" };
    const matches = {
      OB: { ob1: { ...pmOb, BO: 3, IsLive: 2 } },
      PredictFun: { pf1: { ...pmPf } },
    };
    const bets = makeBets({
      OB: { 0: rawOb },
      PredictFun: { 0: rawPf, 3: nativeMap3 },
    });
    const row = {
      ID: 33,
      Title: "NIP vs K27",
      Round: 3,
      HomeGbTeamId: GB_NIP,
      AwayGbTeamId: GB_K27,
      Matchs: { OB: "ob1", PredictFun: "pf1" },
      Reverse: [],
      Bets: [],
    };
    projectClientMatchSides(row, {
      matches,
      bets,
      existingRow: { id: 33, home_gb_team_id: GB_NIP, away_gb_team_id: GB_K27 },
    });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.equal(map0?.Sources?.PredictFun?.BetID, rawPf.BetID, "native map line must not strip Map0");
    assert.equal(map3?.Sources?.PredictFun?.BetID, "pf3");
  });

  it("applyLiveShape after strip does not put PF back on Map0", () => {
    const { row, matches } = projectPfRow({ round: 3 });
    applyLiveShape([row], { matches });
    const map0 = row.Bets.find(b => (Number(b.Map) || 0) === 0);
    const map3 = row.Bets.find(b => Number(b.Map) === 3);
    assert.equal(map0?.Sources?.PredictFun, undefined);
    assert.ok(map3?.Sources?.PredictFun);
  });
});
