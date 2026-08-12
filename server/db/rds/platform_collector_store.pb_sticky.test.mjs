import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  PB_SNAPSHOT_ORPHAN_GRACE_MS,
  isStickyPlatformMatchSnapshot,
  platformMatchOrphanCutoffMs,
  shouldIgnoreEmptyPlatformMatchSnapshot,
} from "./platform_collector_store.js";

describe("PB sticky platform_matches snapshot", () => {
  it("marks only PB as sticky", () => {
    assert.equal(isStickyPlatformMatchSnapshot("PB"), true);
    assert.equal(isStickyPlatformMatchSnapshot("OB"), false);
    assert.equal(isStickyPlatformMatchSnapshot("Polymarket"), false);
  });

  it("ignores empty snapshot for Polymarket and PB", () => {
    assert.equal(shouldIgnoreEmptyPlatformMatchSnapshot("PB"), true);
    assert.equal(shouldIgnoreEmptyPlatformMatchSnapshot("Polymarket"), true);
    assert.equal(shouldIgnoreEmptyPlatformMatchSnapshot("OB"), false);
    assert.equal(shouldIgnoreEmptyPlatformMatchSnapshot("RAY"), false);
  });

  it("PB orphan cutoff is now - grace; others immediate", () => {
    const now = 1_700_000_000_000;
    assert.equal(platformMatchOrphanCutoffMs("OB", now), null);
    assert.equal(
      platformMatchOrphanCutoffMs("PB", now),
      now - PB_SNAPSHOT_ORPHAN_GRACE_MS,
    );
    assert.equal(PB_SNAPSHOT_ORPHAN_GRACE_MS, 5 * 60 * 1000);
  });
});
