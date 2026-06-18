import { afterEach, describe, expect, it } from "vitest";
import {
  clearKakaxiQueue,
  dequeueKakaxiBet,
  dequeueKakaxiBetExcludingPlatforms,
  enqueueKakaxiBet,
} from "@/stores/betting/kakaxi/queue";

afterEach(() => {
  clearKakaxiQueue();
});

describe("dequeueKakaxiBetExcludingPlatforms", () => {
  it("skips items that share a platform with busy set", () => {
    enqueueKakaxiBet({
      matchId: 1,
      betId: 1,
      enqueuedAt: 1,
      implied: 1.2,
      isLive: false,
      homePlatform: "OB",
      awayPlatform: "RAY",
    });
    enqueueKakaxiBet({
      matchId: 2,
      betId: 1,
      enqueuedAt: 2,
      implied: 1.1,
      isLive: false,
      homePlatform: "TF",
      awayPlatform: "PB",
    });

    const busy = new Set(["OB", "RAY"] as const);
    const next = dequeueKakaxiBetExcludingPlatforms(busy);

    expect(next?.matchId).toBe(2);
    expect(dequeueKakaxiBet()).toMatchObject({ matchId: 1 });
  });

  it("picks higher priority among compatible items", () => {
    enqueueKakaxiBet({
      matchId: 1,
      betId: 1,
      enqueuedAt: 1,
      implied: 1.05,
      isLive: true,
      homePlatform: "OB",
      awayPlatform: "RAY",
    });
    enqueueKakaxiBet({
      matchId: 2,
      betId: 1,
      enqueuedAt: 2,
      implied: 1.2,
      isLive: false,
      homePlatform: "TF",
      awayPlatform: "PB",
    });

    const next = dequeueKakaxiBetExcludingPlatforms(new Set());

    expect(next?.matchId).toBe(1);
  });
});
