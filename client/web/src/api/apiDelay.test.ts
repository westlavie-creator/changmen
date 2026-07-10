import { describe, expect, it, vi } from "vitest";
import {
  armEsportPostDelaySample,
  counter,
  delay,
  finalizeEsportPostDelaySample,
  resetEsportPostDelayStateForTest,
} from "@/api/apiDelay";
import { readEsportNetworkMs } from "@/api/esportNetworkMs";

describe("apiDelay A8 Ar.post parity", () => {
  it("opens gate only when idle >250ms since last arm", () => {
    resetEsportPostDelayStateForTest();
    armEsportPostDelaySample(1000);
    finalizeEsportPostDelaySample(900, 900, "Client_GetMatchs", 1000);
    expect(delay.value).toBe(100);
    expect(counter.value).toBe(1);

    armEsportPostDelaySample(1100);
    finalizeEsportPostDelaySample(1100, 1100, "Client_GetMatchs", 1150);
    expect(delay.value).toBe(100);

    armEsportPostDelaySample(1301);
    finalizeEsportPostDelaySample(1301, 1301, "Client_GetMatchs", 1400);
    expect(delay.value).toBe(99);
    expect(counter.value).toBe(3);
  });

  it("increments counter on every post even when gate closed", () => {
    resetEsportPostDelayStateForTest();
    finalizeEsportPostDelaySample(0, 0, "Client_GetMatchs", 50);
    expect(delay.value).toBe(0);
    expect(counter.value).toBe(1);
  });

  it("armed request records Date.now()-startedAt in finally when no Resource Timing", () => {
    resetEsportPostDelayStateForTest();
    armEsportPostDelaySample(300);
    finalizeEsportPostDelaySample(300, 300, "Client_GetMatchs", 600);
    expect(delay.value).toBe(300);
  });

  it("prefers network timing when wall clock inflated by main-thread gap", () => {
    resetEsportPostDelayStateForTest();
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      {
        name: "https://example.com/esport/Client_GetMatchs?user=u1",
        startTime: 1000,
        requestStart: 1005,
        responseEnd: 1020,
      } as PerformanceResourceTiming,
    ]);

    armEsportPostDelaySample(3000);
    finalizeEsportPostDelaySample(3000, 1000, "Client_GetMatchs", 5200);
    expect(delay.value).toBe(15);

    vi.restoreAllMocks();
  });
});

describe("readEsportNetworkMs", () => {
  it("returns undefined without matching resource entry", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    expect(readEsportNetworkMs("Client_GetMatchs", 1000)).toBeUndefined();
    vi.restoreAllMocks();
  });
});
