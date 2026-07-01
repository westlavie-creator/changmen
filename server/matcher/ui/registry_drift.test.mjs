import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildRegistryDriftReport } from "./registry_drift.js";

describe("registry_drift", () => {
  it("detects match_id mismatch on platform row", () => {
    const drift = buildRegistryDriftReport({
      clientMatches: [{ id: 1, matchs: { OB: "a" } }],
      platforms: {
        OB: [{ platform: "OB", source_match_id: "a", client_match_id: 2 }],
      },
      eventBindings: [{ platform: "OB", source_match_id: "a", event_id: 1 }],
    });
    assert.equal(drift.ok, false);
    assert.equal(drift.platformDrift[0].issue, "match_id_mismatch");
  });

  it("ok when materialized and registry align", () => {
    const drift = buildRegistryDriftReport({
      clientMatches: [{ id: 5, matchs: { OB: "x", RAY: "y" } }],
      platforms: {
        OB: [{ platform: "OB", source_match_id: "x", client_match_id: 5 }],
        RAY: [{ platform: "RAY", source_match_id: "y", client_match_id: 5 }],
      },
      eventBindings: [
        { platform: "OB", source_match_id: "x", event_id: 5 },
        { platform: "RAY", source_match_id: "y", event_id: 5 },
      ],
    });
    assert.equal(drift.ok, true);
    assert.equal(drift.issueCount, 0);
  });
});
