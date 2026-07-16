/**
 * 各馆比赛/盘口陆续到库：多 tick 时序回归。
 * 每 tick 的 existingRow = 上一 tick 写出的锁（模拟 RDS）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/project_side_sources.js";
import {
  checkNotSamePhysicalSide,
  checkSourcesMatchLockTeams,
} from "../src/invariants.js";
import {
  GB_K27,
  GB_NIP,
  installPlugin,
  makeAccumulate,
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

function tick(state, {
  matchs,
  matches,
  accumulate,
  overrides = {},
  stickyOrientation,
} = {}) {
  installPlugin();
  const row = {
    ID: state.id,
    Matchs: matchs,
    Bets: state.betsTemplate.map(b => ({ Map: b.Map, Sources: { ...(b.Sources || {}) } })),
    Title: state.title || "",
  };
  const result = projectClientMatchSides(row, {
    matches,
    bets: {},
    timers: {},
    sourceFromBet: () => ({}),
    buildAccumulateRow: makeAccumulate(accumulate),
    existingRow: state.existing,
    platformOverrides: { [state.id]: overrides },
    stickyOrientation,
  });
  state.existing = persist(row);
  state.title = row.Title;
  state.last = { row, result };
  return state.last;
}

describe("arrival: RAY first then OB (higher priority upgrade)", () => {
  it("RAY-only flipped lock upgrades when OB arrives → no Reverse", () => {
    const state = {
      id: 5001,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };

    // T1: 仅 RAY（native 翻转 = K27 主）
    let { row, result } = tick(state, {
      matchs: { RAY: "ray1" },
      matches: { RAY: { ray1: pmRayFlipped } },
      accumulate: { RAY: { 0: rawRayFlipped } },
    });
    assert.equal(result.lockSource, "RAY");
    assert.equal(row.HomeGbTeamId, GB_K27);
    assert.deepEqual(row.Reverse, []);

    // T2: OB 到齐（NiP 主）→ 默认 upgrade，不再 sticky 错向
    ({ row, result } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRayFlipped } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRayFlipped } },
    }));
    assert.match(result.lockSource, /^upgrade:OB$/);
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.deepEqual([...row.Reverse].sort(), ["RAY"]); // RAY native 翻转相对 OB 锁
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-nip");
    assert.equal(row.Bets[0].Sources.RAY.HomeID, "roid-nip");

    const native = { "OB:0": rawOb, "RAY:0": rawRayFlipped };
    assert.equal(checkSourcesMatchLockTeams(row, {
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRayFlipped } },
      nativeByPlatformMap: native,
    }).ok, true);
    assert.equal(checkNotSamePhysicalSide(row, {
      platformA: "OB",
      slotA: "Home",
      platformB: "RAY",
      slotB: "Away",
      nativeByPlatformMap: native,
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRayFlipped } },
    }).ok, true);
  });

  it("OB first then RAY: lock stays OB, RAY follows", () => {
    const state = {
      id: 5002,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };

    tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
    });
    assert.equal(state.last.row.HomeGbTeamId, GB_NIP);

    const { row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
    });
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.equal(state.last.result.lockSource, "existing"); // 同向，无需 upgrade
    assert.deepEqual(row.Reverse, []);
  });
});

describe("arrival: Polymarket late beats OB orientation", () => {
  it("OB lock then PM opposite → upgrade to PM", () => {
    const pmFlipped = {
      ...pmPm,
      Home: "K27",
      Away: "Ninjas in Pyjamas",
      HomeID: "pm-k27",
      AwayID: "pm-nip",
    };
    const rawPmFlip = {
      Type: "Polymarket",
      BetID: "p0",
      HomeID: "pmid-k27",
      AwayID: "pmid-nip",
      HomeOdds: 1.5,
      AwayOdds: 2.5,
      Status: "Normal",
    };
    // 注入 PM flipped id map — fixtures 已有 pm-nip/pm-k27
    installPlugin();

    const state = {
      id: 5003,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };

    tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
    });
    assert.equal(state.last.row.HomeGbTeamId, GB_NIP);

    const { row, result } = tick(state, {
      matchs: { Polymarket: "pm1", OB: "ob1" },
      matches: { Polymarket: { pm1: pmFlipped }, OB: { ob1: pmOb } },
      accumulate: { Polymarket: { 0: rawPmFlip }, OB: { 0: rawOb } },
    });
    assert.match(result.lockSource, /^upgrade:Polymarket$/);
    assert.equal(row.HomeGbTeamId, GB_K27);
    assert.deepEqual(row.Reverse, ["OB"]);
  });
});

describe("arrival: Matchs linked before platform row exists", () => {
  it("OB in Matchs but matches.OB empty → fall through to RAY", () => {
    const state = {
      id: 5004,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    const { row, result } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { RAY: { ray1: pmRay } }, // OB 数据未到
      accumulate: { RAY: { 0: rawRay } },
    });
    assert.equal(result.lockSource, "RAY");
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.equal(row.Bets[0].Sources.OB, undefined);
    assert.ok(row.Bets[0].Sources.RAY);

    // OB 数据到达 → upgrade 同向，仍 NIP（existing 已是 NIP；lockSource existing）
    const t2 = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
    });
    assert.equal(t2.row.HomeGbTeamId, GB_NIP);
    assert.ok(t2.row.Bets[0].Sources.OB);
  });

  it("team ids missing then appear → unlock then lock", () => {
    const state = {
      id: 5005,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    const obNoIds = { ...pmOb, HomeID: "", AwayID: "" };
    let { row, result } = tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: obNoIds } },
      accumulate: { OB: { 0: rawOb } },
    });
    assert.equal(result.locked, false);
    assert.deepEqual(row.Bets[0].Sources, {});

    ({ row, result } = tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
    }));
    assert.equal(result.locked, true);
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.ok(row.Bets[0].Sources.OB);
  });
});

describe("arrival: match first, odds later", () => {
  it("locked empty Sources until bets land; no stale junk", () => {
    const state = {
      id: 5006,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: { STALE: { HomeID: "x" } } }],
    };

    let { row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: {}, // 盘口未到
    });
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.deepEqual(row.Bets[0].Sources, {});
    assert.deepEqual(row.Reverse, []);

    ({ row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb } }, // 仅 OB 盘先到
    }));
    assert.ok(row.Bets[0].Sources.OB);
    assert.equal(row.Bets[0].Sources.RAY, undefined);

    ({ row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
      overrides: { RAY: "force_aligned" },
    }));
    assert.ok(row.Bets[0].Sources.RAY);
    assert.deepEqual(row.Reverse, []);
  });
});

describe("arrival: temporary platform data gap", () => {
  it("keeps lock during gap; restores Sources when data returns", () => {
    const state = {
      id: 5007,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };

    tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
    });
    assert.equal(state.existing.home_gb_team_id, GB_NIP);

    // 闪断：matches 全空，但 Matchs 仍挂 OB/RAY 槽
    let { row, result } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: {},
      accumulate: {},
    });
    assert.equal(result.lockSource, "existing-gap");
    assert.equal(row.HomeGbTeamId, GB_NIP);
    // 无 pm → Sources 空（不出盘比错盘安全）
    assert.deepEqual(row.Bets[0].Sources, {});

    ({ row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
    }));
    assert.ok(row.Bets[0].Sources.OB);
    assert.ok(row.Bets[0].Sources.RAY);
  });

  it("OB unlinked leaving only IA clears sticky lock", () => {
    const pmIa = {
      SourceMatchID: "ia1",
      Home: "NiP",
      Away: "K27",
      HomeID: "ia-nip",
      AwayID: "ia-k27",
      SourceGameID: "3",
    };
    const state = {
      id: 5014,
      existing: {
        id: 5014,
        home_gb_team_id: GB_NIP,
        away_gb_team_id: GB_K27,
        title: "Ninjas in Pyjamas vs K27",
      },
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    const { row, result } = tick(state, {
      matchs: { IA: "ia1" },
      matches: { IA: { ia1: pmIa } },
      accumulate: {
        IA: {
          0: {
            Type: "IA",
            BetID: "i0",
            HomeID: "iaoid-nip",
            AwayID: "iaoid-k27",
            HomeOdds: 1.4,
            AwayOdds: 2.6,
            Status: "Normal",
          },
        },
      },
    });
    assert.equal(result.locked, false);
    assert.deepEqual(row.Bets[0].Sources, {});
  });
});

describe("arrival: IA only then OB attaches", () => {
  it("unlocked while IA-only; locks when OB appears", () => {
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
    const state = {
      id: 5008,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };

    let { row, result } = tick(state, {
      matchs: { IA: "ia1" },
      matches: { IA: { ia1: pmIa } },
      accumulate: { IA: { 0: rawIa } },
    });
    assert.equal(result.locked, false);
    assert.deepEqual(row.Bets[0].Sources, {});

    ({ row, result } = tick(state, {
      matchs: { IA: "ia1", OB: "ob1" },
      matches: { IA: { ia1: pmIa }, OB: { ob1: pmOb } },
      accumulate: { IA: { 0: rawIa }, OB: { 0: rawOb } },
    }));
    assert.equal(result.locked, true);
    assert.equal(row.HomeGbTeamId, GB_NIP);
    assert.ok(row.Bets[0].Sources.IA);
    assert.ok(row.Bets[0].Sources.OB);
  });
});

describe("arrival: sticky opt-in preserves first-writer orientation", () => {
  it("with stickyOrientation, RAY-first flipped survives OB arrival", () => {
    const state = {
      id: 5009,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    tick(state, {
      matchs: { RAY: "ray1" },
      matches: { RAY: { ray1: pmRayFlipped } },
      accumulate: { RAY: { 0: rawRayFlipped } },
      stickyOrientation: true,
    });
    const { row, result } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRayFlipped } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRayFlipped } },
      stickyOrientation: true,
      overrides: { RAY: "force_aligned" },
    });
    assert.equal(result.lockSource, "existing");
    assert.equal(row.HomeGbTeamId, GB_K27);
    assert.deepEqual([...row.Reverse].sort(), ["OB"]); // RAY flipped + sticky = aligned
    // 仍不得同边
    assert.equal(checkNotSamePhysicalSide(row, {
      platformA: "OB",
      slotA: "Home",
      platformB: "RAY",
      slotB: "Away",
      nativeByPlatformMap: { "OB:0": rawOb, "RAY:0": rawRayFlipped },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRayFlipped } },
    }).ok, true);
  });
});

describe("arrival: Map0 odds later than MapN promote vacuum", () => {
  it("decider map empty until Map0 odds; then promote fills", () => {
    const state = {
      id: 5010,
      existing: null,
      betsTemplate: [
        { Map: 0, Sources: {} },
        { Map: 3, Sources: {} },
      ],
    };
    let { row } = tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: {},
    });
    assert.deepEqual(row.Bets[0].Sources, {});
    assert.deepEqual(row.Bets[1].Sources, {});

    ({ row } = tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
    }));
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-nip");
    assert.equal(row.Bets[1].Sources.OB.HomeID, "oid-nip");
  });
});

describe("arrival: wrong-pair existing cleared when better anchor arrives", () => {
  it("dirty RDS pair replaced by OB", () => {
    const state = {
      id: 5011,
      existing: {
        id: 5011,
        home_gb_team_id: "999001",
        away_gb_team_id: "999002",
        title: "Wrong vs Pair",
      },
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    const { row, result } = tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
    });
    assert.match(result.lockSource, /^reanchor:OB$/);
    assert.equal(row.HomeGbTeamId, GB_NIP);
  });
});

describe("arrival: sourceMatchId relink to different fixture", () => {
  it("OB remapped to Foo/Bar → reanchor away from NiP/K27", () => {
    const pmFoo = {
      SourceMatchID: "ob2",
      Home: "Foo",
      Away: "Bar",
      HomeID: "ob-foo",
      AwayID: "ob-bar",
      SourceGameID: "3",
    };
    const rawFoo = {
      Type: "OB",
      BetID: "f0",
      HomeID: "oid-foo",
      AwayID: "oid-bar",
      HomeOdds: 1.2,
      AwayOdds: 3.0,
      Status: "Normal",
    };
    const state = {
      id: 5012,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
    });
    assert.equal(state.existing.home_gb_team_id, GB_NIP);

    const { row, result } = tick(state, {
      matchs: { OB: "ob2" },
      matches: { OB: { ob2: pmFoo } },
      accumulate: { OB: { 0: rawFoo } },
    });
    assert.match(result.lockSource, /^reanchor:OB$/);
    assert.notEqual(row.HomeGbTeamId, GB_NIP);
    assert.equal(row.Bets[0].Sources.OB.HomeID, "oid-foo");
  });
});

describe("arrival: interleaved OB/RAY odds with force_aligned mid-way", () => {
  it("force_aligned written while RAY absent cannot poison later reverse", () => {
    const state = {
      id: 5013,
      existing: null,
      betsTemplate: [{ Map: 0, Sources: {} }],
    };
    // T1: only OB, override already has RAY force_aligned（连线抢写）
    tick(state, {
      matchs: { OB: "ob1" },
      matches: { OB: { ob1: pmOb } },
      accumulate: { OB: { 0: rawOb } },
      overrides: { RAY: "force_aligned" },
    });
    // T2: sticky 翻转锁 + RAY 到齐；即使 override 仍在，也必须全员 reverse
    state.existing = {
      id: 5013,
      home_gb_team_id: GB_K27,
      away_gb_team_id: GB_NIP,
      title: "K27 vs Ninjas in Pyjamas",
    };
    const { row } = tick(state, {
      matchs: { OB: "ob1", RAY: "ray1" },
      matches: { OB: { ob1: pmOb }, RAY: { ray1: pmRay } },
      accumulate: { OB: { 0: rawOb }, RAY: { 0: rawRay } },
      overrides: { RAY: "force_aligned" },
      stickyOrientation: true,
    });
    assert.deepEqual([...row.Reverse].sort(), ["OB", "RAY"]);
    assert.notEqual(row.Bets[0].Sources.RAY.AwayID, "roid-k27");
  });
});
