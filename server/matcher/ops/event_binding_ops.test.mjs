import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { assessEventBindingPreview } from "./event_binding_ops.js";

describe("event_binding_ops", () => {
  it("assessEventBindingPreview rejects slot conflict", () => {
    const out = assessEventBindingPreview({
      platform: "RAY",
      sourceMatchId: "new",
      eventId: 9,
      platformRow: { match_id: 2 },
      clientRow: { matchs: { RAY: "old" } },
      eventRow: { id: 9 },
      currentBinding: null,
    });
    assert.equal(out.ok, false);
    assert.match(out.errors[0], /冲突/);
  });

  it("assessEventBindingPreview ok when slot empty", () => {
    const out = assessEventBindingPreview({
      platform: "RAY",
      sourceMatchId: "r1",
      eventId: 5,
      platformRow: { match_id: null },
      clientRow: { matchs: { OB: "o1" } },
      eventRow: { id: 5 },
      currentBinding: null,
    });
    assert.equal(out.ok, true);
  });
});
