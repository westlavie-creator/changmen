import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useOddsStore } from "@/stores/oddsStore";

describe("oddsStore PredictFun truncates like Polymarket", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("getOdds uses truncateOddsTo3 for PredictFun", () => {
    const fo = useOddsStore();
    // 1/0.41 = 2.439024… → trunc 2.439；round 会是 2.439 相同，用需截断的值
    fo.save("PredictFun", {
      id: "tok",
      odds: 1 / 0.37, // 2.702702… → trunc 2.702；round 2.703
      isLock: false,
      time: Date.now(),
    });
    expect(fo.getOdds("PredictFun", "tok")).toBe(2.702);
    expect(fo.getOdds("OB", "tok", 1 / 0.37)).not.toBe(2.702);
  });
});
