import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  PLATFORM_MATCH_PAST_PRUNE_MS,
  PLATFORM_MATCH_START_TIME_PRUNE_PLATFORMS,
  resolvePlatformStartTimePruneOpts,
} from "../../../db/rds/platform_collector_store.js";

describe("platform start_time past prune safety", () => {
  it("defaults to PredictFun only (never all platforms / Polymarket)", () => {
    assert.deepEqual([...PLATFORM_MATCH_START_TIME_PRUNE_PLATFORMS], ["PredictFun"]);
    const { platforms, cutoff } = resolvePlatformStartTimePruneOpts({ nowMs: 1_700_000_000_000 });
    assert.deepEqual(platforms, ["PredictFun"]);
    assert.equal(cutoff, 1_700_000_000_000 - PLATFORM_MATCH_PAST_PRUNE_MS);
    assert.equal(PLATFORM_MATCH_PAST_PRUNE_MS, 6 * 60 * 60 * 1000);
  });

  it("empty platforms short-circuits (no accidental full-table delete)", () => {
    const { platforms } = resolvePlatformStartTimePruneOpts({ platforms: [] });
    assert.deepEqual(platforms, []);
  });

  it("trims and dedupes explicit platform allowlist", () => {
    const { platforms } = resolvePlatformStartTimePruneOpts({
      platforms: [" PredictFun ", "PredictFun", "", null],
    });
    assert.deepEqual(platforms, ["PredictFun"]);
  });
});
