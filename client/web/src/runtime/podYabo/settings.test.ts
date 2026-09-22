import { describe, expect, it } from "vitest";
import { resolvePodYaboStake } from "@/runtime/podYabo/settings";

describe("podYabo/settings", () => {
  it("keeps fixed stake when AutoYabo randomization is off", () => {
    expect(resolvePodYaboStake(100, { stakeRandomStep: 0, stakeRandomLevels: 3 })).toBe(100);
    expect(resolvePodYaboStake(100, { stakeRandomStep: 10, stakeRandomLevels: 0 })).toBe(100);
  });

  it("picks a bounded random stake around the base", () => {
    const settings = { stakeRandomStep: 10, stakeRandomLevels: 2 };
    expect(resolvePodYaboStake(100, settings, () => 0)).toBe(80);
    expect(resolvePodYaboStake(100, settings, () => 0.5)).toBe(100);
    expect(resolvePodYaboStake(100, settings, () => 0.999)).toBe(120);
  });
});
