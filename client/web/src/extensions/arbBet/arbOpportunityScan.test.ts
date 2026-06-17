import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isA8StrictMode: vi.fn(() => false),
}));

vi.mock("@/shared/a8Strict", () => ({
  isA8StrictMode: mocks.isA8StrictMode,
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    message: { telegramId: "123" },
  }),
}));

import {
  OPPORTUNITY_SCAN_INTERVAL_MS,
  resetOpportunityScanThrottleForTest,
  shouldRunOpportunityScan,
} from "@/extensions/arbBet/arbOpportunityScan";

describe("shouldRunOpportunityScan", () => {
  beforeEach(() => {
    mocks.isA8StrictMode.mockReturnValue(false);
    resetOpportunityScanThrottleForTest();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first scan then throttles within interval", () => {
    expect(shouldRunOpportunityScan()).toBe(true);
    expect(shouldRunOpportunityScan()).toBe(false);

    vi.setSystemTime(OPPORTUNITY_SCAN_INTERVAL_MS);
    expect(shouldRunOpportunityScan()).toBe(true);
  });
});
