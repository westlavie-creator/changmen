import { describe, expect, it } from "vitest";
import { BetResult } from "@/models/betResult";
import { arbMakeUpSides } from "@/stores/betting/autoBet/arbMakeUpPair";

describe("arbMakeUpSides", () => {
  it("enqueues A when A fails and B is clean anchor", () => {
    const resultA = new BetResult("RAY", false);
    const resultB = new BetResult("OB", true);
    expect(arbMakeUpSides(resultA, false, false, resultB, false, false)).toBe("enqueueA");
  });

  it("treats PM success with reject as failed leg → enqueue opposite anchor", () => {
    const pm = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm",
      reject: "unfilled",
    });
    const ob = new BetResult("OB", true);
    expect(arbMakeUpSides(pm, false, false, ob, false, false)).toBe("enqueueA");
    expect(arbMakeUpSides(ob, false, false, pm, false, false)).toBe("enqueueB");
  });

  it("treats venue reject flag as failed leg", () => {
    const ray = new BetResult("RAY", true);
    const ob = new BetResult("OB", true);
    expect(arbMakeUpSides(ray, true, false, ob, false, false)).toBe("enqueueA");
    expect(arbMakeUpSides(ob, false, false, ray, true, false)).toBe("enqueueB");
  });

  it("returns null when both legs are clean success", () => {
    const a = new BetResult("RAY", true);
    const b = new BetResult("OB", true);
    expect(arbMakeUpSides(a, false, false, b, false, false)).toBeNull();
  });

  it("PM pending confirm anchors makeup while partner leg rejected", () => {
    const pm = Object.assign(new BetResult("Polymarket", true), { orderId: "0xpm", pending: true });
    const ray = new BetResult("RAY", true);
    expect(arbMakeUpSides(ray, true, false, pm, false, true)).toBe("enqueueA");
    expect(arbMakeUpSides(pm, false, true, ray, true, false)).toBe("enqueueB");
  });
});
