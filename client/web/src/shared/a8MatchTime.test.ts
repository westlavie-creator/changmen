import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  A8_MATCH_MAX_FUTURE_MS,
  A8_MATCH_MAX_PAST_MS,
  a8StartTimeCollectAllowed,
} from "@/shared/a8MatchTime";

describe("a8StartTimeCollectAllowed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows missing or zero start time", () => {
    expect(a8StartTimeCollectAllowed(0)).toBe(true);
  });

  it("rejects start time more than 12h in the past", () => {
    const now = Date.now();
    expect(a8StartTimeCollectAllowed(now - A8_MATCH_MAX_PAST_MS - 1)).toBe(false);
  });

  it("rejects start time more than 1h in the future", () => {
    const now = Date.now();
    expect(a8StartTimeCollectAllowed(now + A8_MATCH_MAX_FUTURE_MS + 1)).toBe(false);
  });

  it("allows start time within past 12h and future 1h window", () => {
    const now = Date.now();
    expect(a8StartTimeCollectAllowed(now - 60_000)).toBe(true);
    expect(a8StartTimeCollectAllowed(now + 60_000)).toBe(true);
  });
});
