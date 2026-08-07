import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  findReuseIdByPlatformOverlap,
  matchsSignature,
} from "@changmen/match-identity/ids/client_match_ids.js";
import { clientMatchWriteRow } from "../compose/write_payload.js";
import { resolveIdsDryRun } from "../compose/ids/resolve_ids.js";

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

  it("platform overlap helper hits ended rows", () => {
    const id = findReuseIdByPlatformOverlap(
      [{ id: 15, matchs: { OB: "a", TF: "b" } }],
      { OB: "a", RAY: "c" },
    );
    assert.equal(id, 15);
    assert.ok(matchsSignature({ OB: "a", TF: "b" }).includes("OB:a"));
  });
});
