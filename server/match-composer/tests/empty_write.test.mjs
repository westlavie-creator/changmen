import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { shouldAllowEmptyWrite } from "../ops/compose_once.js";

describe("shouldAllowEmptyWrite", () => {
  it("allows nonempty", () => {
    assert.equal(shouldAllowEmptyWrite({ info: [{}], endedCount: 0 }).ok, true);
  });

  it("allows all-ended when every previous active was processed", () => {
    const r = shouldAllowEmptyWrite({
      info: [],
      endedCount: 2,
      processedActiveIds: new Set([10, 11]),
      previousActiveIds: [10, 11],
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason, "all_ended_covered");
  });

  it("rejects empty when previous actives were not in this tick", () => {
    const r = shouldAllowEmptyWrite({
      info: [],
      endedCount: 1,
      processedActiveIds: new Set([10]),
      previousActiveIds: [10, 99, 100],
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "empty_but_unprocessed_actives");
    assert.equal(r.uncoveredCount, 2);
  });

  it("rejects disaster empty", () => {
    const r = shouldAllowEmptyWrite({
      info: [],
      endedCount: 0,
      processedActiveIds: new Set(),
      previousActiveIds: [1],
    });
    assert.equal(r.ok, false);
  });

  it("force allows disaster empty", () => {
    assert.equal(
      shouldAllowEmptyWrite({
        info: [],
        endedCount: 0,
        allowEmptyWrite: true,
        previousActiveIds: [1],
      }).ok,
      true,
    );
  });
});
