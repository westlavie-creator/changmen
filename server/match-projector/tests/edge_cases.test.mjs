import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  pickLockFromAnchors,
  resolveOrientationLock,
  sideModeAgainstLock,
} from "../src/orientation_lock.js";
import {
  projectClientMatchSides,
  projectPlatformSource,
  reprojectClientMatchList,
} from "../src/project_side_sources.js";
import {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
  checkUnlockedEmpty,
} from "../src/invariants.js";
import {
  GB_BAR,
  GB_FOO,
  GB_K27,
  GB_NIP,
  installPlugin,
  makeAccumulate,
  pmIa,
  pmOb,
  pmPm,
  pmPf,
  pmRay,
  pmRayFlipped,
  rawIa,
  rawOb,
  rawPm,
  rawRay,
  rawRayFlipped,
} from "./fixtures.mjs";

describe("anchor priority PM > OB > RAY > PredictFun", () => {
  it("Polymarket wins over OB even if OB present", () => {
    installPlugin();
    const matches = {
      Polymarket: { pm1: pmPm },
      OB: { ob1: pmOb },
    };
    const picked = pickLockFromAnchors({ Polymarket: "pm1", OB: "ob1" }, matches);
    assert.equal(picked.anchorPlatform, "Polymarket");
  });

  it("OB wins when Polymarket missing or unmapped", () => {
    installPlugin();
    const matches = {
      Polymarket: {
        pm1: {
          ...pmPm,
          HomeID: "pm-unknown",
          AwayID: "pm-other",
        },
      },
      OB: { ob1: pmOb },
    };
    const picked = pickLockFromAnchors({ Polymarket: "pm1", OB: "ob1" }, matches);
    assert.equal(picked.anchorPlatform, "OB");
  });

  it("RAY used only when PM+OB absent", () => {
    installPlugin();
    const matches = { RAY: { ray1: pmRay } };
    const picked = pickLockFromAnchors({ RAY: "ray1" }, matches);
    assert.equal(picked.anchorPlatform, "RAY");
    assert.equal(picked.homeGb, GB_NIP);
  });

  it("PredictFun is last fallback after RAY", () => {
    installPlugin();
    const withRay = pickLockFromAnchors(
      { RAY: "ray1", PredictFun: "pf1" },
      { RAY: { ray1: pmRay }, PredictFun: { pf1: pmPf } },
    );
    assert.equal(withRay.anchorPlatform, "RAY");
    const pfOnly = pickLockFromAnchors(
      { PredictFun: "pf1" },
      { PredictFun: { pf1: pmPf } },
    );
    assert.equal(pfOnly.anchorPlatform, "PredictFun");
    assert.equal(pfOnly.homeGb, GB_NIP);
    assert.equal(pfOnly.awayGb, GB_K27);
  });
});

describe("mixed native orientations", () => {
  it("OB aligned + RAY native-flipped → only RAY in Reverse", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRayFlipped } };
    const row = {
      ID: 10,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    const result = projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({
        OB: { 0: rawOb },
        RAY: { 0: rawRayFlipped },
      }),
      existingRow: null,
    });
    assert.deepEqual(result.reverse, ["RAY"]);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-nip");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-nip"); // swapped from flipped raw
  });

  it("hedge OB.Home + RAY.Away is opposite physical sides", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = {
      ID: 11,
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
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
      stickyOrientation: true,
    });
    const native = {
      "OB:0": rawOb,
      "RAY:0": rawRay,
    };
    const i1 = checkHomeSlotConsistency(row, native);
    assert.equal(i1.ok, true, i1.violations.join("; "));
    const same = checkNotSamePhysicalSide(row, {
      platformA: "OB",
      slotA: "Home",
      platformB: "RAY",
      slotB: "Away",
      nativeByPlatformMap: native,
      matches,
    });
    assert.equal(same.ok, true, same.violations.join("; "));
  });
});

describe("unlocked / stale cleanup", () => {
  it("clears junk Sources and Reverse when unlocked", () => {
    installPlugin();
    const matches = { IA: { ia1: pmIa } };
    const row = {
      ID: 20,
      Matchs: { IA: "ia1" },
      HomeGbTeamId: GB_K27,
      AwayGbTeamId: GB_NIP,
      Reverse: ["OB", "RAY"],
      Bets: [{ Map: 0, Sources: { IA: { ...rawIa }, OB: { ...rawOb } } }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ IA: { 0: rawIa } }),
      existingRow: null,
    });
    assert.deepEqual(row.Reverse, []);
    assert.deepEqual(row.Bets[0].Sources, {});
    assert.equal(checkUnlockedEmpty(row).ok, true);
  });

  it("drops platforms not in Matchs from Sources", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 21,
      Matchs: { OB: "ob1" },
      Bets: [{ Map: 0, Sources: { OB: rawOb, RAY: rawRay } }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb } }),
      existingRow: null,
    });
    assert.equal(row.Bets[0].Sources.RAY, undefined);
    assert.ok(row.Bets[0].Sources.OB);
  });

  it("missing pm → omit that platform, others still project", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } }; // RAY listed in Matchs但无 matches 数据
    const row = {
      ID: 22,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    const result = projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb } }),
      existingRow: null,
    });
    assert.ok(row.Bets[0].Sources.OB);
    assert.equal(row.Bets[0].Sources.RAY, undefined);
    assert.ok(result.omitted.some(o => o.platform === "RAY" && o.reason === "no_pm"));
  });
});

describe("force_reversed / ambiguous / name fallback", () => {
  it("force_reversed on aligned venue swaps Sources + Reverse", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 30,
      Matchs: { OB: "ob1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb } }),
      existingRow: null,
      platformOverrides: { 30: { OB: "force_reversed" } },
    });
    assert.deepEqual(row.Reverse, ["OB"]);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-k27");
  });

  it("name fallback when team ids missing", () => {
    installPlugin();
    const mode = sideModeAgainstLock(
      "OB",
      {
        Home: "Ninjas in Pyjamas",
        Away: "K27",
        HomeID: "",
        AwayID: "",
        SourceGameID: "3",
      },
      GB_NIP,
      GB_K27,
    );
    assert.equal(mode, "aligned");
  });

  it("partial id map falls through → ambiguous if names mismatch", () => {
    installPlugin();
    const mode = sideModeAgainstLock(
      "OB",
      {
        Home: "Mystery",
        Away: "Ghost",
        HomeID: "ob-nip",
        AwayID: "",
        SourceGameID: "3",
      },
      GB_NIP,
      GB_K27,
    );
    assert.equal(mode, "ambiguous");
  });
});

describe("multi-map + map order + native on higher maps", () => {
  it("processes Map3 before Map0 in array but does not Map0-fill Map3", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 40,
      Matchs: { OB: "ob1" },
      Bets: [
        { Map: 3, Sources: { STALE: 1 } },
        { Map: 0, Sources: {} },
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
    const m0 = row.Bets.find(b => b.Map === 0);
    const m3 = row.Bets.find(b => b.Map === 3);
    assert.equal(m0.Sources.OB.HomeID, "oid-k27");
    assert.equal(m3.Sources.OB, undefined, "Map3 must not inherit Map0");
    assert.equal(m3.Sources.STALE, undefined);
  });

  it("higher map native preferred over promote", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const map3Raw = {
      Type: "OB",
      BetID: "m3",
      HomeID: "oid3-nip",
      AwayID: "oid3-k27",
      HomeOdds: 1.1,
      AwayOdds: 2.2,
      Status: "Normal",
    };
    const row = {
      ID: 41,
      Matchs: { OB: "ob1" },
      Bets: [
        { Map: 0, Sources: {} },
        { Map: 3, Sources: {} },
      ],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({
        OB: { 0: rawOb, 3: map3Raw },
      }),
      existingRow: null,
    });
    assert.equal(row.Bets[1].Sources.OB.HomeID, "oid3-nip");
    assert.equal(row.Bets[1].Sources.OB.BetID, "m3");
  });

  it("Reverse empty when all Sources omitted", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 42,
      Matchs: { OB: "ob1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: () => ({ Bets: [] }),
      existingRow: {
        home_gb_team_id: GB_K27,
        away_gb_team_id: GB_NIP,
      },
      stickyOrientation: true,
    });
    assert.deepEqual(row.Reverse, []);
    assert.deepEqual(row.Bets[0].Sources, {});
  });
});

describe("batch reproject + sticky vs dirty", () => {
  it("reprojectClientMatchList stats and per-id existing", () => {
    installPlugin();
    const matches = {
      OB: { ob1: pmOb },
      IA: { ia1: pmIa },
    };
    const list = [
      {
        ID: 100,
        Matchs: { OB: "ob1" },
        Bets: [{ Map: 0, Sources: {} }],
      },
      {
        ID: 101,
        Matchs: { IA: "ia1" },
        HomeGbTeamId: GB_FOO,
        AwayGbTeamId: GB_BAR,
        Bets: [{ Map: 0, Sources: { IA: rawIa } }],
      },
    ];
    const stats = reprojectClientMatchList(list, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb }, IA: { 0: rawIa } }),
      existingClientRows: [
        { id: 100, home_gb_team_id: GB_K27, away_gb_team_id: GB_NIP },
      ],
      forceReanchorOrientation: false,
    });
    assert.equal(stats.locked, 1);
    assert.equal(stats.unlocked, 1);
    // 默认 upgrade 到 OB 朝向
    assert.equal(list[0].HomeGbTeamId, GB_NIP);
    assert.equal(list[1].HomeGbTeamId, undefined);
    assert.deepEqual(list[1].Bets[0].Sources, {});
  });
});

describe("HomeName / Title sync", () => {
  it("sets bet HomeName/AwayName from Title", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb } };
    const row = {
      ID: 50,
      Matchs: { OB: "ob1" },
      Bets: [{ Map: 0, Sources: {} }],
    };
    projectClientMatchSides(row, {
      matches,
      bets: {},
      timers: {},
      sourceFromBet: () => ({}),
      buildAccumulateRow: makeAccumulate({ OB: { 0: rawOb } }),
      existingRow: null,
    });
    assert.equal(row.Bets[0].HomeName, "Ninjas in Pyjamas");
    assert.equal(row.Bets[0].AwayName, "K27");
  });
});

describe("invariant helpers smoke", () => {
  it("checkReverseSubsetOfSources catches dangling Reverse", () => {
    const r = checkReverseSubsetOfSources({
      ID: 1,
      Reverse: ["OB"],
      Bets: [{ Map: 0, Sources: {} }],
    });
    assert.equal(r.ok, false);
  });

  it("I1 fails if Sources not swapped but Reverse claims reverse", () => {
    const row = {
      ID: 1,
      Reverse: ["OB"],
      Bets: [{ Map: 0, Sources: { OB: { ...rawOb } } }],
    };
    const r = checkHomeSlotConsistency(row, { "OB:0": rawOb });
    assert.equal(r.ok, false);
  });
});

describe("projectPlatformSource odds swap", () => {
  it("swaps odds with ids", () => {
    installPlugin();
    const r = projectPlatformSource({
      platform: "OB",
      pm: pmOb,
      raw: rawOb,
      homeGb: GB_K27,
      awayGb: GB_NIP,
    });
    assert.equal(r.source.HomeOdds, rawOb.AwayOdds);
    assert.equal(r.source.AwayOdds, rawOb.HomeOdds);
  });
});

describe("existing without matching Matchs platform data", () => {
  it("keeps sticky lock when anchor temporarily missing", () => {
    installPlugin();
    const matches = {}; // 瞬间无场馆数据
    const row = {
      Matchs: { OB: "ob1" },
      Bets: [],
    };
    const lock = resolveOrientationLock(row, matches, {
      home_gb_team_id: GB_NIP,
      away_gb_team_id: GB_K27,
      title: "Ninjas in Pyjamas vs K27",
    });
    assert.equal(lock.locked, true);
    assert.equal(lock.lockSource, "existing-gap");
    assert.equal(row.HomeGbTeamId, GB_NIP);
  });
});
