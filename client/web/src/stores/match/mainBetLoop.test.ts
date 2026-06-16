import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  MAIN_LOOP_DELAY_MS,
  MATCH_POLL_MS,
  LOSE_ORDER_PRUNE_MS,
  runMainBetLoopFinally,
} from "@/stores/match/mainBetLoop";

describe("mainBetLoop constants", () => {
  it("matches A8 bundle P() timing", () => {
    expect(MAIN_LOOP_DELAY_MS).toBe(100);
    expect(MATCH_POLL_MS).toBe(30_000);
    expect(LOSE_ORDER_PRUNE_MS).toBe(60_000);
  });
});

describe("runMainBetLoopFinally", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it("waits 100ms between ticks", async () => {
    const p = runMainBetLoopFinally();
    await vi.advanceTimersByTimeAsync(99);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
    vi.useRealTimers();
  });
});
