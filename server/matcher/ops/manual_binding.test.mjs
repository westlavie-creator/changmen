import assert from "node:assert/strict";
import { describe, it, vi, afterEach } from "vitest";

vi.mock("@changmen/db", () => ({
  upsertPlatformBindings: vi.fn(async (bindings) => ({ updated: bindings.length })),
  upsertEventBindings: vi.fn(async (bindings) => ({ updated: bindings.length })),
  fetchMatchEventRow: vi.fn(async () => ({ id: 7 })),
  fetchClientMatchRow: vi.fn(async () => ({
    id: 9,
    matchs: { OB: "1", RAY: "2" },
    reverse: ["RAY"],
  })),
}));

import { upsertPlatformBindings } from "@changmen/db";
import {
  persistManualBindingsForClientMatch,
  persistManualPlatformBindings,
} from "./manual_binding.js";

describe("manual_binding", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persistManualPlatformBindings writes manual source", async () => {
    await persistManualPlatformBindings([{
      platform: "RAY",
      source_match_id: "99",
      match_id: 7,
      reversed: true,
    }]);
    assert.equal(upsertPlatformBindings.mock.calls.length, 1);
    const bindings = upsertPlatformBindings.mock.calls[0][0];
    assert.equal(bindings[0].binding_source, "manual");
    assert.equal(bindings[0].binding_side_mode, "reversed");
    assert.equal(bindings[0].binding_confidence, 1);
  });

  it("persistManualBindingsForClientMatch loads client row", async () => {
    const out = await persistManualBindingsForClientMatch(9);
    assert.equal(out.updated, 2);
    const bindings = upsertPlatformBindings.mock.calls[0][0];
    assert.equal(bindings.length, 2);
    const ray = bindings.find(b => b.platform === "RAY");
    assert.equal(ray.binding_side_mode, "reversed");
  });
});
