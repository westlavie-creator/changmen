import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { clusterByGbThenName } from "../src/cluster/merge_clusters.js";
import {
  GB_BAR,
  GB_FOO,
  installPlugin,
  pmIa,
  pmOb,
  pmRay,
  pmRayFlipped,
} from "./fixtures.mjs";

describe("clusterByGbThenName", () => {
  it("merges same gb pair across platforms", () => {
    installPlugin();
    const list = clusterByGbThenName({
      OB: { ob1: pmOb },
      RAY: { ray1: pmRay },
    });
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].Matchs, { OB: "ob1", RAY: "ray1" });
    assert.equal(list[0]._clusterBasis, "id");
  });

  it("merges flipped venue orientation via unordered gb key", () => {
    installPlugin();
    const list = clusterByGbThenName({
      OB: { ob1: pmOb },
      RAY: { ray1: pmRayFlipped },
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].Matchs.OB, "ob1");
    assert.equal(list[0].Matchs.RAY, "ray1");
  });

  it("does not merge when start times outside id window", () => {
    installPlugin();
    const far = {
      ...pmRay,
      StartTime: pmOb.StartTime + 3 * 60 * 60 * 1000,
    };
    const list = clusterByGbThenName({
      OB: { ob1: pmOb },
      RAY: { ray1: far },
    });
    assert.equal(list.length, 0);
  });

  it("single venue does not form a client match", () => {
    installPlugin();
    const list = clusterByGbThenName({ OB: { ob1: pmOb } });
    assert.equal(list.length, 0);
  });

  it("seeds from existing Matchs (manual link)", () => {
    installPlugin();
    const list = clusterByGbThenName(
      {
        OB: { ob1: pmOb },
        IA: { ia1: pmIa },
      },
      [{
        id: 42,
        merge_key: "manual:seed",
        matchs: { OB: "ob1", IA: "ia1" },
        home_gb_team_id: GB_FOO,
        away_gb_team_id: GB_BAR,
      }],
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].ID, 42);
    assert.equal(list[0]._clusterBasis, "seed");
  });

  it("merges across platforms with different native SourceGameID (a8 GameID)", () => {
    installPlugin();
    // 真实 catalog：OB/RAY/IA 王者荣耀 native id 不同，须归一到 a8GameId=4
    const list = clusterByGbThenName({
      OB: { ob1: { ...pmOb, SourceGameID: "257561197207055" } },
      RAY: { ray1: { ...pmRay, SourceGameID: "74" } },
      IA: { ia1: { ...pmIa, SourceGameID: "16" } },
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]._clusterBasis, "id");
    assert.deepEqual(list[0].Matchs, { OB: "ob1", RAY: "ray1", IA: "ia1" });
    assert.match(String(list[0].MergeKey), /^match:id:4:/);
  });

  it("name-phase merges when ids missing", () => {
    installPlugin();
    const noIdOb = { ...pmOb, HomeID: "", AwayID: "" };
    const noIdRay = { ...pmRay, HomeID: "", AwayID: "" };
    // without plugin name lookup, name merge uses normalizeTeam names
    const list = clusterByGbThenName({
      OB: { ob1: { ...noIdOb, Home: "Alpha Squad", Away: "Beta Force" } },
      RAY: { ray1: { ...noIdRay, Home: "Alpha Squad", Away: "Beta Force" } },
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]._clusterBasis, "name");
  });

  it("merges across platforms despite different native SourceGameID", () => {
    installPlugin();
    // catalog: kog — OB=257561197207055, RAY=74, IA=16（曾因误用馆原生 ID 导致 0 合场）
    const list = clusterByGbThenName({
      OB: { ob1: { ...pmOb, SourceGameID: "257561197207055" } },
      RAY: { ray1: { ...pmRay, SourceGameID: "74" } },
      IA: { ia1: { ...pmIa, SourceGameID: "16" } },
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]._clusterBasis, "id");
    assert.deepEqual(list[0].Matchs, { OB: "ob1", RAY: "ray1", IA: "ia1" });
  });
});
