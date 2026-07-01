import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { validateEventRegistryConsistency } from "./registry_reconcile.js";

describe("registry_reconcile", () => {
  it("validateEventRegistryConsistency passes when aligned", () => {
    const out = validateEventRegistryConsistency(
      [{ ID: 1, Matchs: { OB: "a", RAY: "b" } }],
      [
        { event_id: 1, platform: "OB", source_match_id: "a" },
        { event_id: 1, platform: "RAY", source_match_id: "b" },
      ],
    );
    assert.equal(out.ok, true);
    assert.equal(out.mismatches.length, 0);
  });

  it("detects missing binding", () => {
    const out = validateEventRegistryConsistency(
      [{ ID: 2, Matchs: { OB: "x", RAY: "y" } }],
      [{ event_id: 2, platform: "OB", source_match_id: "x" }],
    );
    assert.equal(out.ok, false);
    assert.equal(out.mismatches[0].issue, "missing_binding");
    assert.equal(out.mismatches[0].platform, "RAY");
  });
});
