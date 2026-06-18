import { afterEach, describe, expect, it } from "vitest";
import {
  clearKakaxiQueue,
  dequeueKakaxiBet,
  enqueueKakaxiBet,
  hasKakaxiBet,
  kakaxiQueueSize,
  removeKakaxiBet,
} from "@/stores/betting/kakaxi/queue";

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
