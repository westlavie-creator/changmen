import { describe, expect, it } from "vitest";
import { canAppearArbOrderDuringRejectWait } from "./appearArbOrderGate";

describe("canAppearArbOrderDuringRejectWait", () => {
  it("never appears during reject wait (A8 empty wait)", () => {
    expect(canAppearArbOrderDuringRejectWait("RAY")).toBe(false);
    expect(canAppearArbOrderDuringRejectWait("OB")).toBe(false);
    expect(canAppearArbOrderDuringRejectWait("PB")).toBe(false);
    expect(canAppearArbOrderDuringRejectWait("Polymarket")).toBe(false);
    expect(canAppearArbOrderDuringRejectWait("PredictFun")).toBe(false);
    expect(canAppearArbOrderDuringRejectWait(undefined)).toBe(false);
    expect(canAppearArbOrderDuringRejectWait("")).toBe(false);
  });
});
