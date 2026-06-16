import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isClientMatchEnded, allMapBetsClosed } from "../merge/match_lifecycle.js";

const NOW = Date.parse("2026-06-16T10:00:00+08:00");

describe("allMapBetsClosed", () => {
  it("requires every map bet source Locked", () => {
    assert.equal(
      allMapBetsClosed([
        { Map: 1, Sources: { OB: { Status: "Locked" } } },
        { Map: 2, Sources: { OB: { Status: "Normal" } } },
      ]),
      false,
    );
    assert.equal(
      allMapBetsClosed([
        { Map: 1, Sources: { OB: { Status: "Locked" }, RAY: { Status: "Locked" } } },
        { Map: 2, Sources: { OB: { Status: "Locked" } } },
      ]),
      true,
    );
    assert.equal(
      allMapBetsClosed([
        { Map: 0, Sources: { RAY: { Status: "Normal" }, IA: { Status: "Normal" } } },
        { Map: 1, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
        { Map: 2, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
      ]),
      false,
    );
  });
});

describe("isClientMatchEnded", () => {
  const platformMatches = {
    OB: {
      "99": { SourceMatchID: "99", IsLive: 1, StartTime: NOW - 3600_000 },
    },
  };

  it("returns false when Round > 0", () => {
    assert.equal(
      isClientMatchEnded(
        { Round: 2, StartTime: NOW - 1000, Matchs: { OB: "99" }, Bets: [] },
        platformMatches,
        {},
        NOW,
      ),
      false,
    );
  });

  it("returns false before StartTime", () => {
    assert.equal(
      isClientMatchEnded(
        { Round: 0, StartTime: NOW + 3600_000, Matchs: { OB: "99" }, Bets: [] },
        platformMatches,
        {},
        NOW,
      ),
      false,
    );
  });

  it("returns false when is_live=2", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99" },
          Bets: [{ Map: 2, Sources: { OB: { Status: "Normal" } } }],
        },
        { OB: { "99": { SourceMatchID: "99", IsLive: 2 } } },
        {},
        NOW,
      ),
      false,
    );
  });

  it("returns true when past start, is_live=1, all map bets locked", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99" },
          Bets: [
            { Map: 1, Sources: { OB: { Status: "Locked" } } },
            { Map: 2, Sources: { OB: { Status: "Locked" } } },
          ],
        },
        platformMatches,
        { OB: { timer: [] } },
        NOW,
      ),
      true,
    );
  });

  it("returns false when is_live=1 but map bets still Normal (delayed pre-live)", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 600_000,
          Matchs: { OB: "99" },
          Bets: [{ Map: 1, Sources: { OB: { Status: "Normal" } } }],
        },
        platformMatches,
        {},
        NOW,
      ),
      false,
    );
  });

  it("returns false without OB when past 30min but map bets still Normal", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 45 * 60_000,
          Matchs: { RAY: "ray1", IA: "ia1" },
          Bets: [
            { Map: 1, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
            { Map: 2, Sources: { RAY: { Status: "Normal" }, IA: { Status: "Normal" } } },
          ],
        },
        {
          RAY: { ray1: { SourceMatchID: "ray1" } },
          IA: { ia1: { SourceMatchID: "ia1" } },
        },
        {},
        NOW,
      ),
      false,
    );
  });

  it("returns true without OB when all map bets locked", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 45 * 60_000,
          Matchs: { RAY: "ray1", IA: "ia1" },
          Bets: [
            { Map: 1, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
            { Map: 2, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
          ],
        },
        {
          RAY: { ray1: { SourceMatchID: "ray1" } },
          IA: { ia1: { SourceMatchID: "ia1" } },
        },
        {},
        NOW,
      ),
      true,
    );
  });

  it("returns false without OB when Map 0 full match still Normal", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 45 * 60_000,
          Matchs: { RAY: "ray1", IA: "ia1" },
          Bets: [
            { Map: 0, Sources: { RAY: { Status: "Normal" }, IA: { Status: "Normal" } } },
            { Map: 1, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
            { Map: 2, Sources: { RAY: { Status: "Locked" }, IA: { Status: "Locked" } } },
          ],
        },
        {
          RAY: { ray1: { SourceMatchID: "ray1" } },
          IA: { ia1: { SourceMatchID: "ia1" } },
        },
        {},
        NOW,
      ),
      false,
    );
  });
});
