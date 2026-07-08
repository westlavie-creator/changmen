import { describe, expect, it } from "vitest";
import { BetResult } from "@/models/betResult";
import {
  legFailedForMakeUpTarget,
  legSucceededForMakeUpAnchor,
} from "./makeUpLegOutcome";

describe("makeUpLegOutcome", () => {
  it("treats PM success with reject as failed target", () => {
    const result = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm",
      reject: "unfilled",
    });
    expect(legSucceededForMakeUpAnchor(result, false)).toBe(false);
    expect(legFailedForMakeUpTarget(result, false)).toBe(true);
  });

  it("treats venue reject flag as failed target even when success", () => {
    const result = new BetResult("OB", true);
    expect(legFailedForMakeUpTarget(result, true)).toBe(true);
    expect(legSucceededForMakeUpAnchor(result, true)).toBe(false);
  });

  it("treats clean success as anchor leg", () => {
    const result = new BetResult("RAY", true);
    expect(legSucceededForMakeUpAnchor(result, false)).toBe(true);
    expect(legFailedForMakeUpTarget(result, false)).toBe(false);
  });

  it("PM pending confirm can anchor makeup while partner leg rejected", () => {
    const pm = Object.assign(new BetResult("Polymarket", true), { orderId: "0xpm", pending: true });
    const ray = new BetResult("RAY", true);
    expect(legSucceededForMakeUpAnchor(pm, false, true)).toBe(true);
    expect(legFailedForMakeUpTarget(pm, false, true)).toBe(false);
    expect(legFailedForMakeUpTarget(ray, true, false)).toBe(true);
  });
});
