import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { buildEventRowsFromMergeRows } from "./sync_event_registry.js";

describe("sync_event_registry", () => {
  afterEach(() => {
    delete process.env.MATCHER_EVENT_REGISTRY;
  });

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
});
