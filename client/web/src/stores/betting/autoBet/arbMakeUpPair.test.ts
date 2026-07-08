import { describe, expect, it } from "vitest";
import { BetResult } from "@/models/betResult";
import { arbMakeUpSides } from "@/stores/betting/autoBet/arbMakeUpPair";

describe("arbMakeUpSides", () => {
  it("enqueues A when A fails and B is filled anchor", () => {
    const resultA = new BetResult("RAY", false);
    const resultB = new BetResult("OB", true);
    expect(arbMakeUpSides(resultA, false, resultB, false)).toBe("enqueueA");
  });

  it("treats PM success with reject as failed leg → enqueue opposite anchor", () => {
    const pm = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm",
      reject: "unfilled",
    });
    const ob = new BetResult("OB", true);
    expect(arbMakeUpSides(pm, false, ob, false)).toBe("enqueueA");
    expect(arbMakeUpSides(ob, false, pm, false)).toBe("enqueueB");
  });

  it("treats venue not-filled (reject/timeout) as failed leg", () => {
    const ray = new BetResult("RAY", true);
    const ob = new BetResult("OB", true);
    expect(arbMakeUpSides(ray, true, ob, false)).toBe("enqueueA");
    expect(arbMakeUpSides(ob, false, ray, true)).toBe("enqueueB");
  });

  it("returns null when both legs are filled", () => {
    const a = new BetResult("RAY", true);
    const b = new BetResult("OB", true);
    expect(arbMakeUpSides(a, false, b, false)).toBeNull();
  });

  it("returns null when both legs are not filled", () => {
    const ray = new BetResult("RAY", true);
    const pm = Object.assign(new BetResult("Polymarket", true), { orderId: "0xpm" });
    expect(arbMakeUpSides(ray, true, pm, true)).toBeNull();
  });

  it("enqueues B when OB filled and PM venue timeout/not-filled", () => {
    const ob = new BetResult("OB", true);
    const pm = Object.assign(new BetResult("Polymarket", true), { orderId: "0xpm" });
    expect(arbMakeUpSides(ob, false, pm, true)).toBe("enqueueB");
  });

  it("enqueues A when RAY venue reject and PM filled", () => {
    const ray = new BetResult("RAY", true);
    const pm = Object.assign(new BetResult("Polymarket", true), { orderId: "0xpm" });
    expect(arbMakeUpSides(ray, true, pm, false)).toBe("enqueueA");
  });
});
