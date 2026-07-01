import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildEventRowsFromMergeRows, buildManualEventStub } from "./sync_event_registry.js";

describe("sync_event_registry", () => {
  it("buildEventRowsFromMergeRows maps pairing fields", () => {
    const rows = buildEventRowsFromMergeRows([{
      ID: 42,
      Title: "A vs B",
      Game: "LOL",
      GameID: "1",
      StartTime: 1_700_000_000_000,
      BO: 3,
      PairingTier: "provisional",
      PairingConfidence: 0.8,
      EventAnchor: "OB:99",
      HomeGbTeamId: "100",
      AwayGbTeamId: "200",
    }], 9_999);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 42);
    assert.equal(rows[0].pairing_tier, "provisional");
    assert.equal(rows[0].event_anchor, "OB:99");
    assert.equal(rows[0].built_at, 9_999);
    assert.equal(rows[0].home_gb_team_id, 100);
  });

  it("buildManualEventStub prefers OB anchor and verified tier", () => {
    const stub = buildManualEventStub(99, {
      title: "A vs B",
      game: "LOL",
      game_id: "1",
      start_time: 1_700_000_000_000,
      bo: 3,
      matchs: { RAY: "r1", OB: "o1" },
    });
    assert.equal(stub.ID, 99);
    assert.equal(stub.EventAnchor, "OB:o1");
    assert.equal(stub.PairingTier, "verified");
  });
});
