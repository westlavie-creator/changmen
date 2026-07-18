import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  filterActiveClientMatches,
  isClientMatchEnded,
} from "../src/shape/ended_filter.js";
import { filterMultiPlatform } from "../src/shape/live_shape.js";

describe("ended_filter + multi platform", () => {
  it("drops ended when all sources gone after start", () => {
    const now = Date.now();
    const row = {
      ID: 1,
      StartTime: now - 10 * 60 * 1000,
      Round: 0,
      Matchs: { OB: "gone", RAY: "gone2" },
      Bets: [],
    };
    assert.equal(isClientMatchEnded(row, {}, {}, now), true);
  });

  it("keeps live Round>0", () => {
    const now = Date.now();
    const row = {
      ID: 2,
      StartTime: now - 60_000,
      Round: 1,
      Matchs: { OB: "ob1" },
      Bets: [{ Map: 0, Sources: { OB: { Status: "Normal" } } }],
    };
    assert.equal(
      isClientMatchEnded(row, { OB: { ob1: { SourceMatchID: "ob1", IsLive: 2 } } }, {}, now),
      false,
    );
  });

  it("filterActiveClientMatches removes ended only", () => {
    const now = Date.now();
    const { list, endedCount } = filterActiveClientMatches([
      {
        ID: 1,
        StartTime: now - 10 * 60 * 1000,
        Round: 0,
        Matchs: { OB: "x" },
        Bets: [],
      },
      {
        ID: 2,
        StartTime: now + 60_000,
        Round: 0,
        Matchs: { OB: "ob1", RAY: "ray1" },
        Bets: [],
      },
    ], { platformMatches: {}, now });
    assert.equal(endedCount, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].ID, 2);
  });

  it("filterMultiPlatform after strip", () => {
    const kept = filterMultiPlatform([
      { Matchs: { OB: "1", RAY: "2" } },
      { Matchs: { OB: "1" } },
      { Matchs: {} },
    ]);
    assert.equal(kept.length, 1);
  });

  it("filterMultiPlatform keeps live single-platform rows", () => {
    const kept = filterMultiPlatform([
      { Matchs: { OB: "1" }, Round: 1 },
      { Matchs: { OB: "2" }, Round: 0 },
      { Matchs: {}, Round: 2 },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].Matchs.OB, "1");
  });

  it("dual link requires PM and OB both confirm", () => {
    const now = Date.now();
    const row = {
      ID: 3,
      StartTime: now - 3600_000,
      Round: 0,
      Matchs: { OB: "ob1", Polymarket: "pm1" },
      Bets: [{ Map: 1, Sources: { OB: { Status: "Locked" } } }],
    };
    const matches = { OB: { ob1: { SourceMatchID: "ob1", IsLive: 1 } } };
    assert.equal(
      isClientMatchEnded(row, matches, {}, now, { slug: "pm1", ended: true, status: "finished" }),
      true,
    );
    assert.equal(
      isClientMatchEnded(row, matches, {}, now, { slug: "pm1", ended: false, status: "running" }),
      false,
    );
    assert.equal(
      isClientMatchEnded(
        row,
        { OB: { ob1: { SourceMatchID: "ob1", IsLive: 2 } } },
        {},
        now,
        { slug: "pm1", ended: true, status: "finished" },
      ),
      false,
    );
  });
});
