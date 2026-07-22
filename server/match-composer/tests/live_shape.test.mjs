import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyLiveShape,
  promoteMap0ToDecider,
  resolveRowBo,
  trimMapZeroLive,
} from "../src/shape/live_shape.js";

const obMatches = (bo = 3) => ({
  OB: { ob1: { SourceMatchID: "ob1", BO: bo } },
});

describe("live_shape", () => {
  it("promote Map0 Sources to decider map without second swap", () => {
    const matches = {
      ...obMatches(3),
      RAY: { ray1: { SourceMatchID: "ray1", BO: 0 } },
    };
    const row = {
      ID: 1,
      Round: 3,
      Matchs: { OB: "ob1", RAY: "ray1" },
      Reverse: ["RAY"],
      Bets: [{
        Map: 0,
        Sources: {
          OB: { BetID: "m0", HomeID: "h", AwayID: "a" },
          RAY: { BetID: "r0", HomeID: "rh", AwayID: "ra" },
        },
      }],
    };
    promoteMap0ToDecider([row], matches);
    const live = row.Bets.find(b => b.Map === 3);
    assert.ok(live);
    assert.equal(live.Sources.RAY.HomeID, "rh");
    assert.equal(live.Sources.OB.HomeID, "h");
  });

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

  it("non-decider Round does not promote Map0 onto last map", () => {
    const row = {
      ID: 2,
      Round: 1,
      Matchs: { OB: "ob1" },
      Bets: [{
        Map: 0,
        Sources: { OB: { BetID: "m0", HomeID: "h", AwayID: "a" } },
      }, {
        Map: 3,
        Sources: {},
      }],
    };
    promoteMap0ToDecider([row], obMatches(3));
    const last = row.Bets.find(b => b.Map === 3);
    assert.ok(last);
    assert.equal(Object.keys(last.Sources || {}).length, 0);
  });

  it("decider Round promotes Map0 onto last map when OB.BO matches", () => {
    const row = {
      ID: 3,
      Round: 3,
      Matchs: { OB: "ob1" },
      Bets: [{
        Map: 0,
        Sources: { OB: { BetID: "m0", HomeID: "h", AwayID: "a" } },
      }, {
        Map: 3,
        Sources: {},
      }],
    };
    promoteMap0ToDecider([row], obMatches(3));
    const last = row.Bets.find(b => b.Map === 3);
    assert.equal(last.Sources.OB.BetID, "m0");
  });

  it("Round=2 with OB BO=3 does not promote (Falcons mid-series)", () => {
    const matches = {
      OB: { ob1: { SourceMatchID: "ob1", BO: 3 } },
      PB: { pb1: { SourceMatchID: "pb1", BO: 1 } },
      Polymarket: { pm1: { SourceMatchID: "pm1", BO: 0 } },
    };
    const row = {
      ID: 4,
      Round: 2,
      Matchs: { OB: "ob1", PB: "pb1", Polymarket: "pm1" },
      Bets: [{
        Map: 0,
        Sources: {
          OB: { BetID: "ob-full", HomeID: "h", AwayID: "a" },
          PB: { BetID: "pb-full", HomeID: "ph", AwayID: "pa" },
        },
      }, {
        Map: 2,
        Sources: {
          Polymarket: { BetID: "pm-m2", HomeID: "mh", AwayID: "ma" },
        },
      }],
    };
    assert.equal(resolveRowBo(row, matches), 3);
    promoteMap0ToDecider([row], matches);
    const map2 = row.Bets.find(b => b.Map === 2);
    assert.equal(map2.Sources.PB, undefined, "PB full must not enter Map2 mid BO3");
    assert.equal(map2.Sources.Polymarket.BetID, "pm-m2");
  });

  it("no OB linked → BO=0 → no promote", () => {
    const matches = {
      PB: { pb1: { SourceMatchID: "pb1", BO: 1 } },
      Polymarket: { pm1: { SourceMatchID: "pm1", BO: 0 } },
      RAY: { ray1: { SourceMatchID: "ray1", BO: 3 } },
    };
    const row = {
      ID: 5,
      BO: 3,
      Round: 3,
      Matchs: { PB: "pb1", Polymarket: "pm1", RAY: "ray1" },
      Bets: [{
        Map: 0,
        Sources: {
          PB: { BetID: "pb-full", HomeID: "h", AwayID: "a" },
          RAY: { BetID: "ray-full", HomeID: "rh", AwayID: "ra" },
        },
      }, {
        Map: 3,
        Sources: {},
      }],
    };
    assert.equal(resolveRowBo(row, matches), 0);
    promoteMap0ToDecider([row], matches);
    assert.deepEqual(Object.keys(row.Bets.find(b => b.Map === 3).Sources || {}), []);
  });

  it("resolveRowBo ignores row.BO and non-OB platforms", () => {
    const matches = {
      OB: { ob1: { SourceMatchID: "ob1", BO: 3 } },
      PB: { pb1: { SourceMatchID: "pb1", BO: 1 } },
    };
    assert.equal(resolveRowBo({ Matchs: { OB: "ob1", PB: "pb1" }, BO: 1 }, matches), 3);
    assert.equal(resolveRowBo({ Matchs: { PB: "pb1" }, BO: 5 }, matches), 0);
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
    applyLiveShape([row], { matches, timers: {} });
    assert.equal(row.Matchs.RAY, undefined);
    assert.equal(row.Bets[0].Sources.RAY, undefined);
    assert.deepEqual(row.Reverse, []);
  });
});
