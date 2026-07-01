import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  enrichClientMatchPairing,
  enrichDashboardPairing,
  enrichPlatformRowBinding,
  summarizePairingStats,
  tierLabel,
} from "./pairing_ui.js";

describe("pairing_ui", () => {
  it("enrichClientMatchPairing uses DB tier", () => {
    const cm = enrichClientMatchPairing({
      id: 1,
      pairing_tier: "verified",
      pairing_confidence: 0.95,
      event_anchor: "OB:99",
      matchs: { OB: "99", RAY: "1" },
    });
    assert.equal(cm.pairing.tier, "verified");
    assert.equal(cm.pairing.label, tierLabel("verified"));
    assert.equal(cm.pairing.event_anchor, "OB:99");
  });

  it("infers provisional from merge_mode when tier missing", () => {
    const cm = enrichClientMatchPairing({
      id: 2,
      matchs: { OB: "1", RAY: "2" },
      merge_mode: { mode: "name" },
    });
    assert.equal(cm.pairing.tier, "provisional");
  });

  it("enrichPlatformRowBinding maps snake_case", () => {
    const row = enrichPlatformRowBinding({
      platform: "RAY",
      binding_source: "auto_id",
      binding_confidence: 0.9,
      binding_side_mode: "aligned",
    });
    assert.equal(row.binding.source_label, "ID 自动");
    assert.equal(row.binding.confidence_label, "90%");
  });

  it("enrichDashboardPairing adds debug.pairing", () => {
    const out = enrichDashboardPairing({
      clientMatches: [{
        id: 1,
        pairing_tier: "verified",
        pairing_confidence: 1,
        matchs: { OB: "1", RAY: "2" },
      }],
      platforms: {},
      debug: { platformMatches: 10 },
    });
    assert.equal(out.debug.pairing.verified, 1);
    assert.equal(out.clientMatches[0].pairing.tier, "verified");
  });

  it("summarizePairingStats averages confidence", () => {
    const s = summarizePairingStats([
      { pairing: { tier: "verified", confidence: 0.8 } },
      { pairing: { tier: "verified", confidence: 1 } },
    ]);
    assert.equal(s.verified, 2);
    assert.equal(s.avg_confidence, 0.9);
  });
});
