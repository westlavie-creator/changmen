import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyLiveShape,
  promoteMap0ToDecider,
  trimMapZeroLive,
} from "../src/shape/live_shape.js";

describe("live_shape", () => {
  it("promote Map0 Sources to decider map without second swap", () => {
    const row = {
      ID: 1,
      BO: 3,
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
    promoteMap0ToDecider([row], {});
    const live = row.Bets.find(b => b.Map === 3);
    assert.ok(live);
    assert.equal(live.Sources.RAY.HomeID, "rh");
    assert.equal(live.Sources.OB.HomeID, "h");
  });

  it("trim Map0 to OB/Polymarket when live and preserve InitialOdds", () => {
    const row = {
      Round: 1,
      Bets: [{
        Map: 0,
        Sources: {
          OB: { HomeID: "1", HomeOdds: 1.8, AwayOdds: 2.1 },
          RAY: { HomeID: "2", HomeOdds: 1.9, AwayOdds: 2.0 },
          Polymarket: { HomeID: "3", HomeOdds: 1.7, AwayOdds: 2.2 },
        },
      }],
    };
    trimMapZeroLive([row]);
    assert.ok(row.Bets[0].Sources.OB);
    assert.ok(row.Bets[0].Sources.Polymarket);
    assert.equal(row.Bets[0].Sources.RAY, undefined);
    assert.equal(row.Bets[0].InitialHomeOdds, 1.9);
    assert.equal(row.Bets[0].InitialAwayOdds, 2.2);
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
