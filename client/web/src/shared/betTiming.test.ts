import type { UserConfig } from "@/types/userConfig";
import { describe, expect, it } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";
import {
  arbBetToastSeconds,
  makeUpBetToastSeconds,
  MANUAL_BET_TOAST_SECONDS,
  manualBetToastSeconds,
  normalizeWaitTime,
} from "./betTiming";

function cfg(waitTime: Record<string, number>): UserConfig {
  return { ...createDefaultUserConfig(), waitTime };
}

describe("normalizeWaitTime", () => {
  it("coerces keys to numbers like A8 D8", () => {
    expect(normalizeWaitTime({ OB: "15", PB: 3, RAY: -1 })).toEqual({
      OB: 15,
      PB: 3,
      RAY: -1,
    });
  });

  it("maps invalid values to 0", () => {
    expect(normalizeWaitTime({ OB: "", PB: "x" })).toEqual({ OB: 0, PB: 0 });
  });
});

describe("arbBetToastSeconds (A8 Oe)", () => {
  it("uses max of leg waitTime with floor 10", () => {
    expect(arbBetToastSeconds(cfg({ OB: 15, PB: 8 }), ["OB", "PB"])).toBe(15);
    expect(arbBetToastSeconds(cfg({ OB: 3, PB: 3 }), ["OB", "PB"])).toBe(10);
  });

  it("defaults missing platform to 0 then floor 10", () => {
    expect(arbBetToastSeconds(cfg({}), ["OB", "PB"])).toBe(10);
  });

  it("treats -1 like A8 auto arb (floor 10, not 0)", () => {
    expect(arbBetToastSeconds(cfg({ OB: -1, PB: -1 }), ["OB", "PB"])).toBe(10);
  });
});

describe("makeUpBetToastSeconds (A8 Pe)", () => {
  it("returns 0 when waitTime is -1", () => {
    expect(makeUpBetToastSeconds(cfg({ OB: -1 }), "OB")).toBe(0);
  });

  it("uses max(wait, 10) otherwise", () => {
    expect(makeUpBetToastSeconds(cfg({ OB: 15 }), "OB")).toBe(15);
    expect(makeUpBetToastSeconds(cfg({ OB: 3 }), "OB")).toBe(10);
    expect(makeUpBetToastSeconds(cfg({}), "OB")).toBe(10);
  });
});

describe("manualBetToastSeconds", () => {
  it("is fixed 10 like A8 v=async(_,A,T=10)", () => {
    expect(manualBetToastSeconds()).toBe(10);
    expect(MANUAL_BET_TOAST_SECONDS).toBe(10);
  });
});
