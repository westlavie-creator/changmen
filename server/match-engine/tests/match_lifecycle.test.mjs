import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  allMapBetsClosed,
  filterActiveClientMatches,
  isClientMatchEnded,
  isPmSportEnded,
  pmSportMatchesLink,
} from "../merge/match_lifecycle.js";

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

describe("pmSportMatchesLink", () => {
  it("matches slug or eventId", () => {
    assert.equal(pmSportMatchesLink("pm1", { slug: "pm1" }), true);
    assert.equal(pmSportMatchesLink("evt-9", { eventId: "evt-9" }), true);
    assert.equal(pmSportMatchesLink("pm1", { slug: "other", ended: true }), false);
  });
});

describe("isClientMatchEnded", () => {
  const platformMatches = {
    OB: {
      99: { SourceMatchID: "99", IsLive: 1, StartTime: NOW - 3600_000 },
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
        { OB: { 99: { SourceMatchID: "99", IsLive: 2 } } },
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

  it("dual link: PM ended + OB is_live=2 → not archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "pm1" },
          Bets: [
            { Map: 1, Sources: { OB: { Status: "Locked" } } },
            { Map: 2, Sources: { OB: { Status: "Locked" } } },
          ],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 2 } } },
        {},
        NOW,
        { slug: "pm1", ended: true, status: "finished" },
      ),
      false,
    );
  });

  it("dual link: PM ended + Round>0 → not archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 2,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "pm1" },
          Bets: [{ Map: 1, Sources: { OB: { Status: "Locked" } } }],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 1 } } },
        {},
        NOW,
        { slug: "pm1", ended: true, status: "finished" },
      ),
      false,
    );
  });

  it("dual link: PM ended + OB locked + is_live=1 → archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "pm1" },
          Bets: [
            { Map: 1, Sources: { OB: { Status: "Locked" }, RAY: { Status: "Normal" } } },
            { Map: 2, Sources: { OB: { Status: "Locked" } } },
          ],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 1 } } },
        {},
        NOW,
        { slug: "pm1", ended: true, status: "finished" },
      ),
      true,
    );
  });

  it("dual link: PM ended via eventId + OB locked → archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "evt-42" },
          Bets: [{ Map: 1, Sources: { OB: { Status: "Locked" } } }],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 1 } } },
        {},
        NOW,
        { eventId: "evt-42", ended: true, status: "finished" },
      ),
      true,
    );
  });

  it("dual link: PM running + OB all locked → not archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "pm1" },
          Bets: [
            { Map: 1, Sources: { OB: { Status: "Locked" } } },
            { Map: 2, Sources: { OB: { Status: "Locked" } } },
          ],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 1 } } },
        {},
        NOW,
        { slug: "pm1", ended: false, status: "running" },
      ),
      false,
    );
  });

  it("dual link: PM ended but OB map Normal → not archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "pm1" },
          Bets: [{ Map: 1, Sources: { OB: { Status: "Normal" } } }],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 1 } } },
        {},
        NOW,
        { slug: "pm1", ended: true, status: "finished" },
      ),
      false,
    );
  });

  it("dual link: stale pm_sport identity mismatch → not archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { OB: "99", Polymarket: "pm-new" },
          Bets: [
            { Map: 1, Sources: { OB: { Status: "Locked" } } },
            { Map: 2, Sources: { OB: { Status: "Locked" } } },
          ],
        },
        { OB: { 99: { SourceMatchID: "99", IsLive: 1 } } },
        {},
        NOW,
        { slug: "pm-old", ended: true, status: "finished" },
      ),
      false,
    );
  });

  it("PM-only: ended with matching slug → archived", () => {
    assert.equal(
      isClientMatchEnded(
        {
          Round: 0,
          StartTime: NOW - 3600_000,
          Matchs: { Polymarket: "pm1" },
          Bets: [{ Map: 1, Sources: { Polymarket: { Status: "Normal" } } }],
        },
        {},
        {},
        NOW,
        { slug: "pm1", ended: true, status: "finished" },
      ),
      true,
    );
  });

  it("returns false when PM ended without Polymarket link in Matchs", () => {
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
        { OB: { 99: { SourceMatchID: "99", IsLive: 2 } } },
        {},
        NOW,
        { ended: true, status: "finished" },
      ),
      false,
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

describe("isPmSportEnded", () => {
  it("detects ended flag and finished status", () => {
    assert.equal(isPmSportEnded({ ended: true }), true);
    assert.equal(isPmSportEnded({ status: "finished" }), true);
    assert.equal(isPmSportEnded({ status: "Final" }), true);
    assert.equal(isPmSportEnded({ status: "running", ended: false }), false);
  });
});

describe("filterActiveClientMatches", () => {
  const platformMatches = {
    OB: { 99: { SourceMatchID: "99", IsLive: 1 } },
  };
  const pmSportByClientId = new Map([[696, { slug: "pm1", ended: true, status: "finished" }]]);

  it("removes dual-confirmed ended rows from write list", () => {
    const { list, endedCount } = filterActiveClientMatches([
      {
        ID: 696,
        Round: 0,
        StartTime: NOW - 3600_000,
        Matchs: { OB: "99", Polymarket: "pm1" },
        Bets: [
          { Map: 1, Sources: { OB: { Status: "Locked" } } },
          { Map: 2, Sources: { OB: { Status: "Locked" } } },
        ],
      },
      {
        ID: 700,
        Round: 0,
        StartTime: NOW + 3600_000,
        Matchs: { OB: "100" },
        Bets: [],
      },
    ], { platformMatches, pmSportByClientId, now: NOW });
    assert.equal(endedCount, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].ID, 700);
  });
});
