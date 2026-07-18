import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeSportsMarketType,
  takeWholeMatchesUpTo,
} from "./api.js";

describe("polymarket-esports api helpers", () => {
  it("normalizeSportsMarketType never defaults to moneyline", () => {
    assert.equal(normalizeSportsMarketType({}), "");
    assert.equal(normalizeSportsMarketType({ sports_market_type: "spread" }), "spread");
    assert.equal(normalizeSportsMarketType({ sportsMarketType: "Child_Moneyline" }), "child_moneyline");
    assert.equal(
      normalizeSportsMarketType({ sportsMarketType: "moneyline", sports_market_type: "spread" }),
      "moneyline",
    );
  });

  it("takeWholeMatchesUpTo keeps whole SourceMatchID groups", () => {
    const rows = [
      { id: "a1", match: "e1" },
      { id: "a2", match: "e1" },
      { id: "b1", match: "e2" },
      { id: "b2", match: "e2" },
      { id: "c1", match: "e3" },
    ];
    const taken = takeWholeMatchesUpTo(rows, r => r.match, 3);
    assert.deepEqual(taken.map(r => r.id), ["a1", "a2"]);
    const taken4 = takeWholeMatchesUpTo(rows, r => r.match, 4);
    assert.deepEqual(taken4.map(r => r.id), ["a1", "a2", "b1", "b2"]);
  });

  it("takeWholeMatchesUpTo slices oversized first match instead of returning empty", () => {
    const rows = [
      { id: "a1", match: "e1" },
      { id: "a2", match: "e1" },
      { id: "a3", match: "e1" },
    ];
    const taken = takeWholeMatchesUpTo(rows, r => r.match, 2);
    assert.deepEqual(taken.map(r => r.id), ["a1", "a2"]);
  });
});
