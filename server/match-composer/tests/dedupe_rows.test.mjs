import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { dedupeRowsById } from "../src/ids/dedupe_rows.js";

describe("dedupeRowsById", () => {
  it("merges binding stub + auto cluster same ID", () => {
    const { list, mergedCount } = dedupeRowsById([
      {
        ID: 100,
        Matchs: { OB: "ob1" },
        Title: "",
        Bets: [],
        _clusterBasis: "binding",
      },
      {
        ID: 100,
        Matchs: { OB: "ob1", RAY: "ray1" },
        Title: "NiP vs K27",
        Bets: [{ Map: 0, Sources: { OB: { HomeID: "1" }, RAY: { HomeID: "2" } } }],
        _clusterBasis: "id",
      },
    ]);
    assert.equal(mergedCount, 1);
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].Matchs, { OB: "ob1", RAY: "ray1" });
    assert.equal(list[0].Title, "NiP vs K27");
    assert.equal(Object.keys(list[0].Bets[0].Sources).length, 2);
  });

  it("keeps negative temp ids separate", () => {
    const { list, mergedCount } = dedupeRowsById([
      { ID: -1, Matchs: { OB: "a", RAY: "b" } },
      { ID: -2, Matchs: { OB: "c", RAY: "d" } },
    ]);
    assert.equal(mergedCount, 0);
    assert.equal(list.length, 2);
  });
});
