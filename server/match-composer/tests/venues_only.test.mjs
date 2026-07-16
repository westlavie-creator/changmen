import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { snapshotFromVenuesOnly } from "../src/io/venues_only.js";
import { composeFromSnapshot } from "../src/pipeline.js";

describe("fromVenuesOnly", () => {
  it("剥离 client 链接且不产生 seed 簇", () => {
    const snapshot = snapshotFromVenuesOnly({
      matches: {
        OB: {
          ob1: {
            SourceMatchID: "ob1",
            Home: "NiP",
            Away: "K27",
            HomeID: "h1",
            AwayID: "a1",
            StartTime: 1_700_000_000_000,
            ClientMatchId: 99,
            match_id: 99,
          },
        },
        RAY: {
          ray1: {
            SourceMatchID: "ray1",
            Home: "NiP",
            Away: "K27",
            HomeID: "h2",
            AwayID: "a2",
            StartTime: 1_700_000_000_000,
            client_match_id: 99,
          },
        },
      },
      clientRows: [{
        id: 99,
        matchs: { OB: "ob1", RAY: "ray1" },
        merge_key: "seed:99",
        title: "NiP vs K27",
      }],
      alignClientRows: [{ id: 99, matchs: { OB: "ob1", RAY: "ray1" } }],
      platformBindingsByClientId: new Map([[99, [{ platform: "IA", source_match_id: "x" }]]]),
      platformOverrides: { 99: { OB: "force_aligned" } },
    });

    assert.equal(snapshot.clientRows.length, 0);
    assert.equal(snapshot.alignClientRows.length, 0);
    assert.equal(snapshot.platformBindingsByClientId, null);
    assert.deepEqual(snapshot.platformOverrides, {});
    assert.equal(snapshot.matches.OB.ob1.ClientMatchId, undefined);
    assert.equal(snapshot.matches.OB.ob1.match_id, undefined);

    const { list, fromVenuesOnly, alignStats } = composeFromSnapshot(snapshot, {
      fromVenuesOnly: true,
    });
    assert.equal(fromVenuesOnly, true);
    assert.equal(alignStats.skipped, true);
    for (const row of list)
      assert.notEqual(row._clusterBasis, "seed");
  });
});
