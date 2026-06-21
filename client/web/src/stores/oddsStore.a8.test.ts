import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useOddsStore } from "@/stores/oddsStore";

/** [A8 可证实] fo.save 直接覆盖；HTTP 灌盘用 block 公式重算 isLock，可解开 MQTT 误锁 */
describe("oddsStore A8 fo parity", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("hTTP save unlocks after MQTT bet lock (OB)", () => {
    const odds = useOddsStore();
    odds.save(
      "OB",
      { id: "odd1", odds: 1.9, isLock: false, betId: "m1", time: Date.now() },
      "http",
    );
    odds.updateBetLock("OB", "m1", true);
    expect(odds.getOdds("OB", "odd1", 0)).toBe(0);

    odds.save(
      "OB",
      { id: "odd1", odds: 2.1, isLock: false, betId: "m1", time: Date.now() },
      "http",
    );
    expect(odds.getOdds("OB", "odd1", 0)).toBe(2.1);
  });

  it("hTTP save applies locked from block formula", () => {
    const odds = useOddsStore();
    odds.save(
      "OB",
      { id: "odd2", odds: 1.5, isLock: false, betId: "m2", time: Date.now() },
      "http",
    );
    odds.save(
      "OB",
      { id: "odd2", odds: 1.5, isLock: true, betId: "m2", time: Date.now() },
      "http",
    );
    expect(odds.getOdds("OB", "odd2", 0)).toBe(0);
  });
});
