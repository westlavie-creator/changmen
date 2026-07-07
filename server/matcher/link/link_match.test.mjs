import assert from "node:assert/strict";
import { describe, it, vi, beforeEach } from "vitest";

const callOrder = vi.hoisted(() => []);

vi.mock("@changmen/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchPlatformMatchRow: vi.fn(async (platform, sourceMatchId) => ({
      platform,
      source_match_id: sourceMatchId,
      home: "Home Team",
      away: "Away Team",
      home_id: "h1",
      away_id: "a1",
      source_game_id: "cs2",
    })),
    fetchClientMatchRow: vi.fn(async (id) => ({
      id: Number(id),
      title: "Home Team vs Away Team",
      game_id: "3",
      game: "CS2 (cs2)",
      matchs: { IA: "375754" },
      bets: [],
    })),
    fetchPlatformMatchesHomeAway: vi.fn(async () => []),
    setPlatformMatchId: vi.fn(async () => {
      callOrder.push("setPlatformMatchId");
      return { updated: true };
    }),
    patchClientMatchMatchs: vi.fn(async (cmId, additions) => {
      callOrder.push("patchClientMatchMatchs");
      return {
        id: cmId,
        matchs: { IA: "375754", ...additions },
        updated: true,
      };
    }),
    setClientMatchPlatformSideOverride: vi.fn(async () => {
      callOrder.push("setClientMatchPlatformSideOverride");
      return { id: 315, platform: "PB", mode: "force_aligned" };
    }),
    fetchTeamPlatformMap: vi.fn(async () => null),
    upsertTeamPlatformMaps: vi.fn(async () => {}),
  };
});

vi.mock("../../backend/core/esport-api/store.js", () => ({
  default: {
    patchCollectorMatchClientIds: vi.fn(),
  },
}));

vi.mock("../ops/match_merge_once.js", () => ({
  ensureTeamPlugin: vi.fn(async () => {}),
  invalidateTeamPlugin: vi.fn(),
  matchMergeOnce: vi.fn(async () => {
    callOrder.push("matchMergeOnce");
    return { matchCount: 1 };
  }),
}));

vi.mock("../ops/rds_snapshot_cache.js", () => ({
  invalidateMatcherRdsSnapshot: vi.fn(),
}));

vi.mock("../ui/merge_mode.js", () => ({
  resetMatcherUiTeamPlugin: vi.fn(),
}));

describe("linkPlatformToClientMatch write order", () => {
  beforeEach(() => {
    callOrder.length = 0;
  });

  it("patches client_matches.matchs before platform side override", async () => {
    const { linkPlatformToClientMatch } = await import("./index.js");
    const result = await linkPlatformToClientMatch({
      platform: "PB",
      sourceMatchId: "1632372802",
      clientMatchId: 315,
      reversed: false,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(callOrder, [
      "setPlatformMatchId",
      "patchClientMatchMatchs",
      "setClientMatchPlatformSideOverride",
      "matchMergeOnce",
    ]);
  });
});
