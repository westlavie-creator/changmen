import { beforeEach, describe, expect, it } from "vitest";
import {
  clearArbAttemptMetrics,
  recordArbAttemptMetric,
  summarizeArbAttemptMetrics,
} from "@/stores/betting/autoBet/arbAttemptMetrics";

beforeEach(() => {
  clearArbAttemptMetrics();
});

describe("arbAttemptMetrics", () => {
  it("summarizes stop reasons and average phase ms", () => {
    recordArbAttemptMetric({
      at: 1,
      matchId: 1,
      betId: 1,
      stop: "skip_prepare",
      phaseMs: { prepare: 12 },
    });
    recordArbAttemptMetric({
      at: 2,
      matchId: 1,
      betId: 2,
      stop: "complete",
      phaseMs: { prepare: 20, check: 30, place: 100, finalize: 40 },
    });

    const summary = summarizeArbAttemptMetrics();
    expect(summary.total).toBe(2);
    expect(summary.byStop.skip_prepare).toBe(1);
    expect(summary.byStop.complete).toBe(1);
    expect(summary.avgPhaseMs.prepare).toBe(16);
    expect(summary.avgPhaseMs.place).toBe(100);
  });
});
