import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { predictCollectStartTimeAllowed } from "./api.js";

describe("predictCollectStartTimeAllowed past window", () => {
  it("rejects starts older than 2 days", () => {
    const now = Date.now();
    assert.equal(predictCollectStartTimeAllowed(now - 3 * 24 * 60 * 60 * 1000), false);
    assert.equal(predictCollectStartTimeAllowed(now - 25 * 60 * 60 * 1000), true);
    assert.equal(predictCollectStartTimeAllowed(now + 30 * 60 * 1000), true);
    assert.equal(predictCollectStartTimeAllowed(now + 2 * 60 * 60 * 1000), false);
  });
});
