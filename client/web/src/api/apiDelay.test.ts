import { describe, expect, it } from "vitest";
import {
  armEsportPostDelaySample,
  counter,
  delay,
  finalizeEsportPostDelaySample,
  resetEsportPostDelayStateForTest,
} from "@/api/apiDelay";

describe("apiDelay A8 Ar.post parity", () => {
  it("opens gate only when idle >250ms since last arm", () => {
    resetEsportPostDelayStateForTest();
    armEsportPostDelaySample(1000);
    finalizeEsportPostDelaySample(900, 1000);
    expect(delay.value).toBe(100);
    expect(counter.value).toBe(1);

    armEsportPostDelaySample(1100);
    finalizeEsportPostDelaySample(1100, 1150);
    expect(delay.value).toBe(100);

    armEsportPostDelaySample(1301);
    finalizeEsportPostDelaySample(1301, 1400);
    expect(delay.value).toBe(99);
    expect(counter.value).toBe(3);
  });

  it("increments counter on every post even when gate closed", () => {
    resetEsportPostDelayStateForTest();
    finalizeEsportPostDelaySample(0, 50);
    expect(delay.value).toBe(0);
    expect(counter.value).toBe(1);
  });

  it("armed request records Date.now()-startedAt in finally", () => {
    resetEsportPostDelayStateForTest();
    armEsportPostDelaySample(300);
    finalizeEsportPostDelaySample(300, 600);
    expect(delay.value).toBe(300);
  });
});
