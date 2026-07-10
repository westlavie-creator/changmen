import { describe, expect, it, vi } from "vitest";
import {
  armEsportPostDelaySample,
  commitEsportPostDelaySample,
  counter,
  delay,
  finalizeEsportPostDelaySample,
  resetEsportPostDelayStateForTest,
} from "@/api/apiDelay";
import { readEsportNetworkMs } from "@/api/esportNetworkMs";

const sampleMeta = {
  startedAt: 3000,
  startedPerf: 1000,
  action: "Client_GetMatchs",
  url: "https://example.com/esport/Client_GetMatchs?user=u1",
};

describe("apiDelay A8 Ar.post parity", () => {
  it("opens gate only when idle >250ms since last arm", () => {
    resetEsportPostDelayStateForTest();
    armEsportPostDelaySample(1000);
    commitEsportPostDelaySample({ ...sampleMeta, startedAt: 900, startedPerf: 900 }, 1000);
    expect(delay.value).toBe(100);
    expect(counter.value).toBe(0);

    finalizeEsportPostDelaySample();
    expect(counter.value).toBe(1);

    armEsportPostDelaySample(1100);
    commitEsportPostDelaySample({ ...sampleMeta, startedAt: 1100, startedPerf: 1100 }, 1150);
    expect(delay.value).toBe(100);

    armEsportPostDelaySample(1301);
    commitEsportPostDelaySample({ ...sampleMeta, startedAt: 1301, startedPerf: 1301 }, 1400);
    expect(delay.value).toBe(99);
  });

  it("increments counter in finally even when gate closed", () => {
    resetEsportPostDelayStateForTest();
    finalizeEsportPostDelaySample();
    expect(delay.value).toBe(0);
    expect(counter.value).toBe(1);
  });

  it("armed request uses wall clock when no Resource Timing", () => {
    resetEsportPostDelayStateForTest();
    armEsportPostDelaySample(300);
    commitEsportPostDelaySample({ ...sampleMeta, startedAt: 300, startedPerf: 300 }, 600);
    expect(delay.value).toBe(300);
  });

  it("uses Resource Timing for delay when available (Network parity)", () => {
    resetEsportPostDelayStateForTest();
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      {
        name: sampleMeta.url,
        startTime: 1000,
        requestStart: 1005,
        responseEnd: 1020,
        duration: 15,
      } as PerformanceResourceTiming,
    ]);

    armEsportPostDelaySample(3000);
    commitEsportPostDelaySample(sampleMeta, 5200);
    expect(delay.value).toBe(15);

    vi.restoreAllMocks();
  });
});

describe("readEsportNetworkMs", () => {
  it("returns undefined without matching resource entry", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    expect(readEsportNetworkMs("Client_GetMatchs", sampleMeta.url, 1000)).toBeUndefined();
    vi.restoreAllMocks();
  });
});
