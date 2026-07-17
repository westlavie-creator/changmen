import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { swapBetSource } from "@changmen/match-engine";
import {
  pickLockFromAnchors,
  resolveOrientationLock,
  sideModeAgainstLock,
} from "../src/orientation_lock.js";
import {
  applyOverride,
  normalizeOverrideMode,
  projectPlatformSource,
  projectClientMatchSides,
} from "../src/project_side_sources.js";
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

describe("orientation_lock", () => {
  it("IA-only cannot create lock (no min/max)", () => {
    installPlugin();
    const matches = {
      IA: {
        ia1: {
          SourceMatchID: "ia1",
          Home: "NiP",
          Away: "K27",
          HomeID: "ia-nip",
          AwayID: "ia-k27",
          SourceGameID: "3",
        },
      },
    };
    assert.equal(pickLockFromAnchors({ IA: "ia1" }, matches), null);

    const row = {
      Matchs: { IA: "ia1" },
      Title: "",
      Bets: [],
      HomeGbTeamId: GB_K27,
      AwayGbTeamId: GB_NIP,
    };
    const lock = resolveOrientationLock(row, matches, null);
    assert.equal(lock.locked, false);
    assert.equal(row.HomeGbTeamId, undefined);
  });

  it("ignores polluted row.HomeGbTeamId from old finalize", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = {
      Matchs: { OB: "ob1", RAY: "ray1" },
      Title: "K27 vs Ninjas in Pyjamas",
      HomeGbTeamId: GB_K27,
      AwayGbTeamId: GB_NIP,
      Bets: [],
    };
    const lock = resolveOrientationLock(row, matches, null);
    assert.equal(lock.locked, true);
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.equal(row.AwayGbTeamId, GB_K27);
  });

  it("default: upgrades flipped RDS lock to highest anchor orientation", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = { Matchs: { OB: "ob1" }, Title: "", Bets: [] };
    const lock = resolveOrientationLock(row, matches, {
      home_gb_team_id: GB_K27,
      away_gb_team_id: GB_NIP,
    });
    assert.match(lock.lockSource, /^upgrade:/);
    assert.equal(row.HomeGbTeamId, GB_NIP);
  });

  it("stickyOrientation keeps flipped RDS lock when requested", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = { Matchs: { OB: "ob1" }, Title: "", Bets: [] };
    const lock = resolveOrientationLock(row, matches, {
      home_gb_team_id: GB_K27,
      away_gb_team_id: GB_NIP,
    }, { stickyOrientation: true });
    assert.equal(lock.lockSource, "existing");
    assert.equal(row.HomeGbTeamId, GB_K27);
  });

  it("forceReanchorOrientation aligns to OB", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = { Matchs: { OB: "ob1" }, Title: "", Bets: [] };
    const lock = resolveOrientationLock(row, matches, {
      home_gb_team_id: GB_K27,
      away_gb_team_id: GB_NIP,
    }, { forceReanchorOrientation: true });
    assert.match(lock.lockSource, /^upgrade:/);
    assert.equal(row.HomeGbTeamId, GB_NIP);
  });

  it("reanchors when existing lock is wrong team pair", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = { Matchs: { OB: "ob1" }, Title: "", Bets: [] };
    const lock = resolveOrientationLock(row, matches, {
      home_gb_team_id: "999001",
      away_gb_team_id: "999002",
    });
    assert.match(lock.lockSource, /^reanchor/);
    assert.equal(row.HomeGbTeamId, GB_NIP);
  });
});

describe("applyOverride / normalizeOverrideMode", () => {
  it("normalizes string and object forms", () => {
    assert.equal(normalizeOverrideMode("force_aligned"), "force_aligned");
    assert.equal(normalizeOverrideMode({ mode: "force_reversed" }), "force_reversed");
    assert.equal(normalizeOverrideMode("junk"), undefined);
    assert.equal(normalizeOverrideMode(null), undefined);
  });

  it("force_aligned + ambiguous → stay ambiguous", () => {
    assert.equal(applyOverride("ambiguous", "force_aligned"), "ambiguous");
    assert.equal(applyOverride("ambiguous", { mode: "force_aligned" }), "ambiguous");
  });

  it("force_reversed forces swap even when aligned", () => {
    assert.equal(applyOverride("aligned", "force_reversed"), "reversed");
  });
});

describe("projectPlatformSource", () => {
  it("aligned lock → no reverse, Sources = raw", () => {
    installPlugin();
    const r = projectPlatformSource({
      platform: "OB",
      pm: pmOb,
      raw: rawOb,
      homeGb: GB_NIP,
      awayGb: GB_K27,
    });
    assert.equal(r.inReverse, false);
    assert.equal(r.source.HomeID, "oid-nip");
  });

  it("flipped lock → reverse equals swapBetSource", () => {
    installPlugin();
    const r = projectPlatformSource({
      platform: "OB",
      pm: pmOb,
      raw: rawOb,
      homeGb: GB_K27,
      awayGb: GB_NIP,
    });
    assert.equal(r.inReverse, true);
    assert.deepEqual(r.source, swapBetSource(rawOb));
  });

  it("force_aligned ignored when auto is reversed", () => {
    installPlugin();
    const r = projectPlatformSource({
      platform: "RAY",
      pm: pmRay,
      raw: rawRay,
      homeGb: GB_K27,
      awayGb: GB_NIP,
      overrideMode: "force_aligned",
    });
    assert.equal(r.inReverse, true);
    assert.equal(r.source.HomeID, "roid-k27");
  });

  it("force_aligned + ambiguous omits source", () => {
    installPlugin();
    const r = projectPlatformSource({
      platform: "RAY",
      pm: {
        ...pmRay,
        HomeID: "ray-unknown",
        AwayID: "ray-other",
        Home: "Foo",
        Away: "Bar",
      },
      raw: rawRay,
      homeGb: GB_NIP,
      awayGb: GB_K27,
      overrideMode: "force_aligned",
    });
    assert.equal(r.source, null);
    assert.equal(r.omitReason, "ambiguous_ignore_force_aligned");
  });

  it("empty HomeID/AwayID omitted", () => {
    installPlugin();
    const r = projectPlatformSource({
      platform: "OB",
      pm: pmOb,
      raw: { Type: "OB", BetID: "x", HomeID: "", AwayID: "", HomeOdds: 1, AwayOdds: 2 },
      homeGb: GB_NIP,
      awayGb: GB_K27,
    });
    assert.equal(r.source, null);
    assert.equal(r.omitReason, "no_raw_or_lock");
  });

  it("same-side pattern prevented under force_aligned", () => {
    installPlugin();
    const ob = projectPlatformSource({
      platform: "OB",
      pm: pmOb,
      raw: rawOb,
      homeGb: GB_K27,
      awayGb: GB_NIP,
    });
    const ray = projectPlatformSource({
      platform: "RAY",
      pm: pmRay,
      raw: rawRay,
      homeGb: GB_K27,
      awayGb: GB_NIP,
      overrideMode: "force_aligned",
    });
    assert.equal(ob.source.HomeID, "oid-k27");
    assert.equal(ray.source.AwayID, "roid-nip");
    assert.notEqual(ob.source.HomeID === "oid-k27" && ray.source.AwayID === "roid-k27", true);
  });
});

describe("projectClientMatchSides", () => {
  it("emits Reverse under sticky flip; clears junk Sources platforms", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = {
      ID: 1,
      Matchs: { OB: "ob1", RAY: "ray1" },
      HomeGbTeamId: GB_K27,
      AwayGbTeamId: GB_NIP,
      Title: "K27 vs Ninjas in Pyjamas",
      Bets: [{ Map: 0, Sources: { OB: { ...rawOb }, JUNK: { HomeID: "x" } } }],
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
        id: 1,
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
      stickyOrientation: true,
    });
    assert.ok(result.locked);
    assert.deepEqual([...result.reverse].sort(), ["OB", "RAY"]);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-k27");
    assert.equal(row.Bets[0].Sources.JUNK, undefined);
  });

  it("does not fill map line with Map0 when map native missing", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 2,
      Matchs: { OB: "ob1" },
      Title: "",
      Bets: [
        { Map: 0, Sources: {} },
        { Map: 3, Sources: {} },
      ],
    };
    const result = projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb } }),
      existingRow: null,
    });
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-nip");
    assert.equal(row.Bets[1].Sources.OB, undefined, "Map3 must not inherit Map0");
    assert.ok(
      result.omitted.some(o => o.reason === "no_map0_fallback_on_map_line" && o.map === 3),
    );
    assert.deepEqual(row.Reverse, []);
  });

  it("missing mid-map native does not inherit reversed Map0", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 3,
      Matchs: { OB: "ob1" },
      Bets: [
        { Map: 0, Sources: {} },
        { Map: 2, Sources: {} },
      ],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb } }),
      existingRow: {
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
      stickyOrientation: true,
    });
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
    assert.equal(row.Bets[1].Sources.OB, undefined, "Map2 must not inherit Map0");
    assert.deepEqual(row.Reverse, ["OB"]);
  });
});

describe("sideModeAgainstLock", () => {
  it("detects reverse", () => {
    installPlugin();
    assert.equal(sideModeAgainstLock("OB", pmOb, GB_K27, GB_NIP), "reversed");
  });
});
