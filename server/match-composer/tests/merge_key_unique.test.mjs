import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { clusterByGbThenName } from "../src/cluster/merge_clusters.js";
import { resolveIdsDryRun } from "../src/ids/resolve_ids.js";
import { installPlugin, pmOb, pmRay } from "./fixtures.mjs";

describe("MergeKey uniqueness across time buckets", () => {
  it("two same-pair games far apart keep distinct MergeKeys and dry IDs", () => {
    installPlugin();
    const t1 = 1_800_000_000_000;
    const t2 = t1 + 5 * 60 * 60 * 1000; // > id window 60m
    const matches = {
      OB: {
        ob1: { ...pmOb, SourceMatchID: "ob1", StartTime: t1 },
        ob2: { ...pmOb, SourceMatchID: "ob2", StartTime: t2 },
      },
      RAY: {
        ray1: { ...pmRay, SourceMatchID: "ray1", StartTime: t1 },
        ray2: { ...pmRay, SourceMatchID: "ray2", StartTime: t2 },
      },
    };
    const list = clusterByGbThenName(matches, []);
    assert.equal(list.length, 2);
    assert.notEqual(list[0].MergeKey, list[1].MergeKey);
    assert.ok(String(list[0].MergeKey).includes("@") || String(list[1].MergeKey).includes("@"));

    const info = resolveIdsDryRun(list, { matches, existingClientRows: [] });
    assert.notEqual(info[0].ID, info[1].ID);
  });
});
