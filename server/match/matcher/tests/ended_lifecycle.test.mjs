import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  findReuseIdByPlatformOverlap,
  matchsSignature,
  resolveClientMatchIds,
} from "@changmen/match-identity/ids/client_match_ids.js";
import { clientMatchWriteRow } from "../compose/write_payload.js";
import { resolveIdsDryRun } from "../compose/ids/resolve_ids.js";
import { buildExistingClientIdKeyIndex } from "../ops/align_unmatched_to_client.js";

describe("ended lifecycle identity reuse", () => {
  it("clientMatchWriteRow carries ended_at for ended writes", () => {
    const row = clientMatchWriteRow({
      ID: 42,
      Title: "A vs B",
      Game: "csgo",
      GameID: "1",
      StartTime: 1000,
      BO: 3,
      Round: 0,
      RoundStart: 0,
      Reverse: [],
      Matchs: { OB: "1", RAY: "2" },
      Bets: [],
    }, 5000, { endedAt: 5000 });
    assert.equal(row.id, 42);
    assert.equal(row.ended_at, 5000);
    assert.deepEqual(row.matchs, { OB: "1", RAY: "2" });

    const active = clientMatchWriteRow({
      ID: 42,
      Title: "A vs B",
      Matchs: { OB: "1", RAY: "2" },
    }, 5000, { endedAt: null });
    assert.equal(active.ended_at, null);
  });

  it("dry-run reuses id from ended existing row via platform overlap", () => {
    const existing = [
      {
        id: 77,
        merge_key: "match:id:1:10:20",
        matchs: { OB: "ob77", RAY: "ray77" },
        ended_at: 1_700_000_000_000,
      },
    ];
    const built = [{
      MergeKey: "match:name:other",
      Matchs: { OB: "ob77", RAY: "ray77" },
      Title: "reuse",
    }];
    const out = resolveIdsDryRun(built, { existingClientRows: existing });
    assert.equal(out[0].ID, 77);
  });

  it("dry-run does not reuse sticky-ended id via bare merge_key on rematch", () => {
    const mergeKey = "match:id:1:10:20";
    const existing = [
      {
        id: 77,
        merge_key: mergeKey,
        matchs: { OB: "ob-old", RAY: "ray-old" },
        ended_at: 1_700_000_000_000,
      },
    ];
    const built = [{
      MergeKey: mergeKey,
      Matchs: { OB: "ob-new", RAY: "ray-new" },
      Title: "rematch",
      StartTime: 1_800_000_000_000,
    }];
    const idKeyIndex = buildExistingClientIdKeyIndex(existing, {});
    assert.equal(idKeyIndex.has(mergeKey), false);
    const out = resolveIdsDryRun(built, {
      existingClientRows: existing,
      existingIdKeyIndex: idKeyIndex,
    });
    assert.ok(out[0].ID < 0, "rematch must get temp id, not sticky-ended 77");
  });

  it("write resolve inserts new id when merge_key collides with ended non-overlap", async () => {
    const mergeKey = "match:id:1:10:20";
    let inserted = null;
    const adapter = {
      async fetchClientMatchIndex() {
        return [
          {
            id: 77,
            merge_key: mergeKey,
            matchs: { OB: "ob-old", RAY: "ray-old" },
            ended_at: 1_700_000_000_000,
          },
        ];
      },
      async insertClientMatchStub(key, stub) {
        inserted = { key, stub };
        return 9001;
      },
      findClientMatchIdByMergeKey: async () => null,
    };
    const out = await resolveClientMatchIds(adapter, [{
      MergeKey: mergeKey,
      Title: "rematch",
      Game: "csgo",
      GameID: "1",
      StartTime: 1_800_000_000_000,
      BO: 3,
      Matchs: { OB: "ob-new", RAY: "ray-new" },
      Bets: [],
    }]);
    assert.equal(out[0].ID, 9001);
    assert.equal(inserted?.key, mergeKey);
    assert.deepEqual(inserted?.stub?.matchs, { OB: "ob-new", RAY: "ray-new" });
  });

  it("platform overlap helper hits ended rows", () => {
    const id = findReuseIdByPlatformOverlap(
      [{ id: 15, matchs: { OB: "a", TF: "b" } }],
      { OB: "a", RAY: "c" },
    );
    assert.equal(id, 15);
    assert.ok(matchsSignature({ OB: "a", TF: "b" }).includes("OB:a"));
  });
});
