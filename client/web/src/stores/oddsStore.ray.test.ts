import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useOddsStore } from "@/stores/oddsStore";

describe("oddsStore RAY A8 parity", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("HTTP save ignores pending locks for RAY", () => {
    const odds = useOddsStore();
    odds.updateBetLock("RAY", "16854", true);

    odds.save(
      "RAY",
      {
        id: "74232466",
        odds: 2.2,
        isLock: false,
        betId: "16854",
        time: Date.now(),
      },
      "http",
    );

    expect(odds.getOdds("RAY", "74232466", 0)).toBe(2.2);
  });
});
