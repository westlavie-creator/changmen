import { afterEach, describe, expect, it } from "vitest";
import {
  clearKakaxiQueue,
  dequeueKakaxiBet,
  enqueueKakaxiBet,
  hasKakaxiBet,
  kakaxiQueueSize,
  pruneExpiredKakaxiQueue,
  removeKakaxiBet,
  boostKakaxiBetImplied,
} from "@/stores/betting/kakaxi/queue";
import { KAKAXI_QUEUE_TTL_MS } from "@/stores/betting/kakaxi/config";

afterEach(() => {
  clearKakaxiQueue();
});

describe("enqueueKakaxiBet", () => {
  it("dedupes by matchId:betId and refreshes implied", () => {
    expect(
      enqueueKakaxiBet({
        matchId: 1,
        betId: 2,
        enqueuedAt: 100,
        implied: 1.05,
        isLive: false,
      }),
    ).toBe(true);
    expect(
      enqueueKakaxiBet({
        matchId: 1,
        betId: 2,
        enqueuedAt: 200,
        implied: 1.08,
        isLive: true,
      }),
    ).toBe(false);
    expect(kakaxiQueueSize()).toBe(1);
    const next = dequeueKakaxiBet();
    expect(next?.implied).toBe(1.08);
    expect(next?.isLive).toBe(true);
  });
});

describe("dequeueKakaxiBet", () => {
  it("prefers live and higher implied", () => {
    enqueueKakaxiBet({
      matchId: 1,
      betId: 1,
      enqueuedAt: 1,
      implied: 1.1,
      isLive: false,
    });
    enqueueKakaxiBet({
      matchId: 2,
      betId: 1,
      enqueuedAt: 2,
      implied: 1.05,
      isLive: true,
    });
    const next = dequeueKakaxiBet();
    expect(next?.matchId).toBe(2);
  });
});

describe("removeKakaxiBet", () => {
  it("removes a queued bet", () => {
    enqueueKakaxiBet({
      matchId: 9,
      betId: 1,
      enqueuedAt: 1,
      implied: 1.1,
      isLive: false,
    });
    removeKakaxiBet(9, 1);
    expect(hasKakaxiBet(9, 1)).toBe(false);
    expect(dequeueKakaxiBet()).toBeUndefined();
  });
});

describe("boostKakaxiBetImplied", () => {
  it("updates implied for queued bet", () => {
    enqueueKakaxiBet({
      matchId: 1,
      betId: 2,
      enqueuedAt: 100,
      implied: 1.05,
      isLive: false,
    });
    boostKakaxiBetImplied(1, 2, 1.12, true);
    const next = dequeueKakaxiBet();
    expect(next?.implied).toBe(1.12);
    expect(next?.isLive).toBe(true);
  });
});

describe("pruneExpiredKakaxiQueue", () => {
  it("removes entries older than TTL", () => {
    const now = 1_000_000;
    enqueueKakaxiBet({
      matchId: 1,
      betId: 1,
      enqueuedAt: now - KAKAXI_QUEUE_TTL_MS - 1,
      implied: 1.1,
      isLive: false,
    });
    enqueueKakaxiBet({
      matchId: 2,
      betId: 1,
      enqueuedAt: now,
      implied: 1.1,
      isLive: false,
    });
    expect(pruneExpiredKakaxiQueue(now)).toBe(1);
    expect(kakaxiQueueSize()).toBe(1);
    expect(hasKakaxiBet(2, 1)).toBe(true);
  });
});
