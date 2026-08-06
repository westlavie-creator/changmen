import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { checkBetsWithinPeriods } from "../src/invariants.js";
import { applyLiveShape, trimMapZeroLive } from "../src/shape/live_shape.js";
import {
  collectPeriods,
  resolveMatchStructure,
  resolveRowBo,
  resolveRowStructure,
} from "../src/structure/resolve_structure.js";

function obMatches(bo = 3) {
  return {
    OB: { ob1: { SourceMatchID: "ob1", BO: bo } },
  };
}

describe("live_shape", () => {
  it("trim Map0 to OB/Polymarket/PredictFun/Limitless when live and preserve InitialOdds", () => {
    const row = {
      Round: 1,
      Bets: [{
        Map: 0,
        Sources: {
          OB: { HomeID: "1", HomeOdds: 1.8, AwayOdds: 2.1 },
          RAY: { HomeID: "2", HomeOdds: 1.9, AwayOdds: 2.0 },
          Polymarket: { HomeID: "3", HomeOdds: 1.7, AwayOdds: 2.2 },
          PredictFun: { HomeID: "4", HomeOdds: 2.5, AwayOdds: 1.6 },
          Limitless: { HomeID: "5", HomeOdds: 1.55, AwayOdds: 2.4 },
        },
      }],
    };
    trimMapZeroLive([row]);
    assert.ok(row.Bets[0].Sources.OB);
    assert.ok(row.Bets[0].Sources.Polymarket);
    assert.ok(row.Bets[0].Sources.PredictFun);
    assert.ok(row.Bets[0].Sources.Limitless);
    assert.equal(row.Bets[0].Sources.RAY, undefined);
    assert.equal(row.Bets[0].InitialHomeOdds, 2.5);
    assert.equal(row.Bets[0].InitialAwayOdds, 2.4);
  });

  it("applyLiveShape strips orphan platforms", () => {
    const matches = { OB: { ob1: { SourceMatchID: "ob1" } } };
    const row = {
      Round: 0,
      Matchs: { OB: "ob1", RAY: "gone" },
      Reverse: ["RAY"],
      Bets: [{
        Map: 0,
        Sources: {
          OB: { HomeID: "1", AwayID: "2" },
          RAY: { HomeID: "3", AwayID: "4" },
        },
      }],
    };
    applyLiveShape([row], { matches });
    assert.equal(row.Matchs.RAY, undefined);
    assert.equal(row.Bets[0].Sources.RAY, undefined);
    assert.deepEqual(row.Reverse, []);
  });
});

describe("resolve_structure", () => {
  it("resolveRowBo ignores row.BO and non-OB platforms", () => {
    const matches = {
      OB: { ob1: { SourceMatchID: "ob1", BO: 3 } },
      PB: { pb1: { SourceMatchID: "pb1", BO: 1 } },
    };
    assert.equal(resolveRowBo({ Matchs: { OB: "ob1", PB: "pb1" }, BO: 1 }, matches), 3);
    assert.equal(resolveRowBo({ Matchs: { PB: "pb1" }, BO: 5 }, matches), 0);
  });

  it("deciderMap set only when Round === OB.BO", () => {
    const row = { Round: 3, Matchs: { OB: "ob1" } };
    assert.equal(resolveRowStructure(row, { matches: obMatches(3) }).deciderMap, 3);
    assert.equal(
      resolveRowStructure({ ...row, Round: 2 }, { matches: obMatches(3) }).deciderMap,
      0,
      "mid-series must not mark decider",
    );
  });

  it("no OB linked → BO=0 → no decider", () => {
    const matches = {
      PB: { pb1: { SourceMatchID: "pb1", BO: 1 } },
      RAY: { ray1: { SourceMatchID: "ray1", BO: 3 } },
    };
    const row = { BO: 3, Round: 3, Matchs: { PB: "pb1", RAY: "ray1" } };
    const s = resolveRowStructure(row, { matches });
    assert.equal(s.bo, 0);
    assert.equal(s.deciderMap, 0);
  });

  it("periods = bets maps ∪ {0} ∪ decider", () => {
    const row = { Matchs: { OB: "ob1" } };
    const bets = { "OB:ob1": [{ Map: 2 }, { Map: 1 }, { Map: 1 }] };
    assert.deepEqual(collectPeriods(row, bets), [0, 1, 2]);
    assert.deepEqual(collectPeriods(row, bets, 3), [0, 1, 2, 3]);
  });

  it("clears Round before projection when OB is not live", () => {
    const matches = { OB: { ob1: { SourceMatchID: "ob1", IsLive: 1, BO: 3 } } };
    const rows = [{ Round: 2, RoundStart: 123, Matchs: { OB: "ob1" } }];
    resolveMatchStructure(rows, { matches, timers: {}, bets: {} });
    assert.equal(rows[0].Round, 0);
    assert.equal(rows[0].RoundStart, 0);
  });

  it("checkBetsWithinPeriods catches Bet rows added outside the structure layer", () => {
    const row = { ID: 7, _periods: [0, 1], Bets: [{ Map: 0 }, { Map: 1 }] };
    assert.equal(checkBetsWithinPeriods(row).ok, true);
    row.Bets.push({ Map: 3 });
    const bad = checkBetsWithinPeriods(row);
    assert.equal(bad.ok, false);
    assert.match(bad.violations[0], /Map=3 not in periods/);
    assert.equal(checkBetsWithinPeriods({ ID: 8, Bets: [{ Map: 9 }] }).skipped, true);
  });

  it("timer round wins by provider priority", () => {
    const matches = { OB: { ob1: { SourceMatchID: "ob1", IsLive: 2, BO: 3 } } };
    const timers = {
      OB: { timer: [{ matchId: "ob1", round: 2, startTime: 555 }] },
      RAY: { timer: [{ matchId: "ray1", round: 1 }] },
    };
    const rows = [{ Matchs: { OB: "ob1", RAY: "ray1" } }];
    resolveMatchStructure(rows, { matches, timers, bets: {} });
    assert.equal(rows[0].Round, 2);
    assert.equal(rows[0].RoundStart, 555);
  });
});
