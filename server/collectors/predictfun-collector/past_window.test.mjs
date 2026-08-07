import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { predictCollectStartTimeAllowed } from "./api.js";

describe("predictCollectStartTimeAllowed (align Polymarket 6h/1h)", () => {
  it("rejects starts outside [now-6h, now+1h]", () => {
    const now = Date.now();
    assert.equal(predictCollectStartTimeAllowed(now - 7 * 3600 * 1000), false);
    assert.equal(predictCollectStartTimeAllowed(now - 3 * 3600 * 1000), true);
    assert.equal(predictCollectStartTimeAllowed(now + 30 * 60 * 1000), true);
    assert.equal(predictCollectStartTimeAllowed(now + 2 * 60 * 60 * 1000), false);
  });
});
