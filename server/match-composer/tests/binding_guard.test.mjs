import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyPlatformBindings,
  bindingCompatibleWithRow,
} from "../src/cluster/merge_clusters.js";
import {
  GB_BAR,
  GB_FOO,
  installPlugin,
  pmOb,
  pmRay,
} from "./fixtures.mjs";

describe("binding team-pair guard", () => {
  it("rejects binding that is different team pair", () => {
    installPlugin();
    const matches = {
      OB: { ob1: pmOb },
      RAY: {
        rayBad: {
          SourceMatchID: "rayBad",
          Home: "Foo",
          Away: "Bar",
          HomeID: "ray-foo",
          AwayID: "ray-bar",
          SourceGameID: "3",
          StartTime: pmOb.StartTime,
        },
      },
    };
    // plugin needs foo/bar - already in fixtures idMap for RAY:ray-foo
    const row = {
      ID: 9,
      Matchs: { OB: "ob1" },
      Title: "NiP vs K27",
    };
    assert.equal(
      bindingCompatibleWithRow(row, "RAY", "rayBad", matches),
      false,
    );

    const { list, skippedBindings } = applyPlatformBindings(
      [{ ...row, Matchs: { OB: "ob1" }, MergeKey: "x", Bets: [], Reverse: [] }],
      new Map([[9, [{ platform: "RAY", source_match_id: "rayBad" }]]]),
      matches,
    );
    assert.ok(skippedBindings >= 1);
    // only OB → filtered out (<2)
    assert.equal(list.length, 0);
  });

  it("accepts same-pair binding", () => {
    installPlugin();
    const matches = { OB: { ob1: pmOb }, RAY: { ray1: pmRay } };
    const row = { ID: 1, Matchs: { OB: "ob1" } };
    assert.equal(bindingCompatibleWithRow(row, "RAY", "ray1", matches), true);
    void GB_FOO;
    void GB_BAR;
  });
});
