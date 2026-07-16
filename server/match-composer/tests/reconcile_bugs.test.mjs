import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { reconcileClustersByName } from "../src/cluster/reconcile_by_name.js";

const T0 = 1_800_000_000_000;

function entry(platform, sid, home, away, start, extra = {}) {
  return {
    platform,
    sourceMatchId: sid,
    homeName: home,
    awayName: away,
    homeN: home.toLowerCase(),
    awayN: away.toLowerCase(),
    homeGb: extra.homeGb || null,
    awayGb: extra.awayGb || null,
    startMs: start,
    gameCode: "cs2",
    Game: "CS:GO",
    GameID: "3",
    BO: extra.BO ?? 3,
    rowKey: `${platform}:${sid}`,
  };
}

describe("reconcile bugs", () => {
  it("transitive A-B + B-C must not drop A-B when A-C conflicts", () => {
    const all = [
      entry("OB", "ob1", "Foo", "Bar", T0, { homeGb: "1", awayGb: "2" }),
      entry("RAY", "ray1", "Foo", "Bar", T0, { homeGb: "1", awayGb: "2" }),
      entry("IA", "ia1", "Foo", "Bar", T0 + 60_000),
      entry("Polymarket", "pm1", "Foo", "Bar", T0 + 60_000),
      entry("TF", "tf1", "Foo", "Bar", T0 + 90_000),
      entry("PB", "pb1", "Foo", "Bar", T0 + 90_000),
      entry("OB", "ob-OTHER", "Foo", "Bar", T0 + 90_000),
    ];
    const list = [
      {
        MergeKey: "match:id:3:1:2",
        Matchs: { OB: "ob1", RAY: "ray1" },
        Title: "Foo vs Bar",
        StartTime: T0,
        GameID: "3",
        BO: 3,
        _clusterBasis: "id",
      },
      {
        MergeKey: "match:name:3:bar:foo",
        Matchs: { IA: "ia1", Polymarket: "pm1" },
        Title: "Foo vs Bar",
        StartTime: T0 + 60_000,
        GameID: "3",
        BO: 3,
        _clusterBasis: "name",
      },
      {
        // 与 A 同馆 OB 不同 sid → 冲突；与 B 可并
        MergeKey: "match:name:3:bar:foo@2",
        Matchs: { OB: "ob-OTHER", TF: "tf1", PB: "pb1" },
        Title: "Foo vs Bar",
        StartTime: T0 + 90_000,
        GameID: "3",
        BO: 3,
        _clusterBasis: "name",
      },
    ];
    const { list: out } = reconcileClustersByName(list, all);
    // 期望：A+B 并成一场（4馆），C 单独（因与 A 冲突不能进连通分量误伤 A+B）
    const big = out.find(r => r.Matchs?.OB === "ob1" && r.Matchs?.IA);
    assert.ok(big, "A+B should still merge");
    assert.equal(big.Matchs.RAY, "ray1");
    assert.equal(big.Matchs.Polymarket, "pm1");
    assert.equal(out.some(r => r.Matchs?.OB === "ob-OTHER"), true);
    assert.equal(out.length, 2);
  });

  it("ambiguous attach when two id clusters equally near", () => {
    const all = [
      entry("OB", "ob1", "Foo", "Bar", T0, { homeGb: "1", awayGb: "2" }),
      entry("RAY", "ray1", "Foo", "Bar", T0, { homeGb: "1", awayGb: "2" }),
      entry("OB", "ob2", "Foo", "Bar", T0 + 20 * 60_000, { homeGb: "1", awayGb: "2" }),
      entry("RAY", "ray2", "Foo", "Bar", T0 + 20 * 60_000, { homeGb: "1", awayGb: "2" }),
      entry("IA", "ia1", "Foo", "Bar", T0 + 10 * 60_000), // 距两边各 10min
    ];
    const list = [
      {
        MergeKey: "match:id:3:1:2@1",
        Matchs: { OB: "ob1", RAY: "ray1" },
        Title: "Foo vs Bar",
        StartTime: T0,
        GameID: "3",
        BO: 3,
        _clusterBasis: "id",
      },
      {
        MergeKey: "match:id:3:1:2@2",
        Matchs: { OB: "ob2", RAY: "ray2" },
        Title: "Foo vs Bar",
        StartTime: T0 + 20 * 60_000,
        GameID: "3",
        BO: 3,
        _clusterBasis: "id",
      },
    ];
    const { list: out, stats } = reconcileClustersByName(list, all);
    assert.equal(stats.skippedAmbiguous, 1);
    assert.equal(out.every(r => !r.Matchs.IA), true);
  });

  it("inconsistent member gbPair should not gb-bridge merge", () => {
    // 簇内成员 gb 互相矛盾时，不应仅凭错误 gb 去并另一场
    const all = [
      entry("OB", "ob1", "Foo", "Bar", T0, { homeGb: "1", awayGb: "2" }),
      entry("RAY", "ray1", "Foo", "Bar", T0, { homeGb: "9", awayGb: "8" }), // 矛盾
      entry("IA", "ia1", "Other", "Teams", T0 + 60_000, { homeGb: "1", awayGb: "2" }),
      entry("Polymarket", "pm1", "Other", "Teams", T0 + 60_000, { homeGb: "1", awayGb: "2" }),
    ];
    const list = [
      {
        MergeKey: "match:id:bad",
        Matchs: { OB: "ob1", RAY: "ray1" },
        Title: "Foo vs Bar",
        StartTime: T0,
        GameID: "3",
        BO: 3,
        _clusterBasis: "id",
      },
      {
        MergeKey: "match:id:3:1:2",
        Matchs: { IA: "ia1", Polymarket: "pm1" },
        Title: "Other vs Teams",
        StartTime: T0 + 60_000,
        GameID: "3",
        BO: 3,
        _clusterBasis: "id",
      },
    ];
    const { list: out } = reconcileClustersByName(list, all);
    // 队名不同；若错误取了 OB 的 gb(1,2) 会与第二场误并
    assert.equal(out.length, 2);
  });
});
