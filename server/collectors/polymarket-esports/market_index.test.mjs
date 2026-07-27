import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  rebuildPlatformRowsFromIndexEntries,
  resolveRetainIdsFromPreviousIndex,
  mergeRetainedPolymarketIndexEntries,
  mergePolymarketIndexLifecycle,
} from "./market_index.js";

describe("polymarket market_index soft-retain helpers", () => {
  it("resolveRetainIdsFromPreviousIndex keeps in-window missing sids", () => {
    const now = 1_000_000;
    const ids = resolveRetainIdsFromPreviousIndex(
      [
        { sourceMatchId: "a", startTime: now - 30 * 60_000 },
        { sourceMatchId: "b", startTime: now - 3 * 3600_000 },
        { sourceMatchId: "c", startTime: now + 10 * 60_000 },
      ],
      new Set(["c"]),
      now,
      2 * 3600_000,
      3600_000,
    );
    assert.deepEqual(ids, ["a"]);
  });

  it("rebuildPlatformRowsFromIndexEntries restores match + bets", () => {
    const { matches, betsByMatch } = rebuildPlatformRowsFromIndexEntries(
      [
        {
          sourceMatchId: "752423",
          marketId: "m0",
          homeTokenId: "h0",
          awayTokenId: "a0",
          sourceBetId: "m0",
          map: 0,
          homeName: "EDG",
          awayName: "RNG",
          homeOdds: 1.8,
          awayOdds: 2.1,
          status: "Normal",
          startTime: 1785132000000,
        },
        {
          sourceMatchId: "752423",
          marketId: "m1",
          homeTokenId: "h1",
          awayTokenId: "a1",
          sourceBetId: "m1",
          map: 1,
          homeName: "EDG",
          awayName: "RNG",
          homeOdds: 1.9,
          awayOdds: 1.9,
          status: "Locked",
          startTime: 1785132000000,
        },
      ],
      ["752423"],
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].SourceMatchID, "752423");
    assert.equal(matches[0].Home, "EDG");
    assert.equal(betsByMatch.get("752423")?.length, 2);
  });

  it("mergeRetainedPolymarketIndexEntries keeps all maps for a retained match", () => {
    const now = Date.now();
    const merged = mergeRetainedPolymarketIndexEntries(
      [{
        sourceMatchId: "keep",
        marketId: "fresh",
        homeTokenId: "h",
        awayTokenId: "a",
        sourceBetId: "fresh",
        map: 0,
        homeName: "A",
        awayName: "B",
        homeOdds: 1.5,
        awayOdds: 2.5,
        status: "Normal",
        startTime: now,
      }],
      {
        nowMs: now,
        retainSourceMatchIds: ["752423"],
        previousEntries: [
          {
            sourceMatchId: "752423",
            marketId: "m0",
            homeTokenId: "h0",
            awayTokenId: "a0",
            sourceBetId: "m0",
            map: 0,
            homeName: "EDG",
            awayName: "RNG",
            homeOdds: 1.8,
            awayOdds: 2.1,
            status: "Normal",
            startTime: now - 3600_000,
          },
          {
            sourceMatchId: "752423",
            marketId: "m1",
            homeTokenId: "h1",
            awayTokenId: "a1",
            sourceBetId: "m1",
            map: 1,
            homeName: "EDG",
            awayName: "RNG",
            homeOdds: 1.9,
            awayOdds: 1.9,
            status: "Locked",
            startTime: now - 3600_000,
          },
          {
            sourceMatchId: "752423",
            marketId: "m2",
            homeTokenId: "h2",
            awayTokenId: "a2",
            sourceBetId: "m2",
            map: 2,
            homeName: "EDG",
            awayName: "RNG",
            homeOdds: 2.0,
            awayOdds: 1.8,
            status: "Locked",
            startTime: now - 3600_000,
          },
        ],
      },
    );
    const edg = merged.filter(e => e.sourceMatchId === "752423");
    assert.equal(edg.length, 3, "must retain all map entries, not only the first");
    assert.deepEqual(edg.map(e => e.map).sort((a, b) => a - b), [0, 1, 2]);
  });
});

describe("polymarket market_index lifecycle merge", () => {
  it("empty fresh keeps previous minus removeSourceMatchIds", () => {
    const out = mergePolymarketIndexLifecycle([], {
      removeSourceMatchIds: ["gone"],
      previousEntries: [
        { sourceMatchId: "keep", marketId: "m1" },
        { sourceMatchId: "gone", marketId: "m2" },
      ],
    });
    assert.deepEqual(out.map(e => e.sourceMatchId), ["keep"]);
  });

  it("fresh overrides same sid and keeps other previous", () => {
    const out = mergePolymarketIndexLifecycle(
      [{ sourceMatchId: "a", marketId: "new-a", homeOdds: 1.2 }],
      {
        previousEntries: [
          { sourceMatchId: "a", marketId: "old-a", homeOdds: 9 },
          { sourceMatchId: "b", marketId: "old-b" },
        ],
      },
    );
    assert.equal(out.length, 2);
    assert.equal(out.find(e => e.sourceMatchId === "a")?.marketId, "new-a");
    assert.equal(out.find(e => e.sourceMatchId === "b")?.marketId, "old-b");
  });
});
