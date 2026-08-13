import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { resolveComposeEndPatch } from "../compose/compose_once.js";

describe("M1 resolveComposeEndPatch", () => {
  it("does not markEnded when previous active drops out of info", () => {
    const { markEndedIds, activeGaps } = resolveComposeEndPatch({
      previousActiveIds: [1669, 100],
      info: [{ ID: 100 }],
      endedRows: [],
    });
    assert.deepEqual(markEndedIds, []);
    assert.deepEqual(activeGaps, [1669]);
  });

  it("gaps exclude ids already in endedRows", () => {
    const { markEndedIds, activeGaps } = resolveComposeEndPatch({
      previousActiveIds: [1, 2, 3],
      info: [{ ID: 1 }],
      endedRows: [{ ID: 2 }],
    });
    assert.deepEqual(markEndedIds, []);
    assert.deepEqual(activeGaps, [3]);
  });

  it("no gaps when all previous actives are in info or ended", () => {
    const { markEndedIds, activeGaps } = resolveComposeEndPatch({
      previousActiveIds: [1, 2],
      info: [{ ID: 1 }],
      endedRows: [{ ID: 2 }],
    });
    assert.deepEqual(markEndedIds, []);
    assert.deepEqual(activeGaps, []);
  });
});
