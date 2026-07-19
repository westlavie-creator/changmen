import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { ViewBetItem } from "@/models/match";
import { useOddsStore } from "@/stores/oddsStore";

/**
 * 保证套利/展示读 fo 即时价，不依赖 refreshOddsOnBets → updateOdds 抄 fallback。
 * （PM quote 路径已改为只写 fo）
 */
describe("ViewBetItem Polymarket getOdds reads fo without updateOdds", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("returns live fo odds while fallback stays stale", () => {
    const odds = useOddsStore();
    odds.save("Polymarket", {
      id: "tok-home",
      odds: 1.95,
      clobPrice: 0.5128,
      isLock: false,
      betId: "cond-1",
      side: "home",
      time: Date.now(),
    }, "mqtt");

    const item = new ViewBetItem(
      {
        Type: "Polymarket",
        BetID: "cond-1",
        HomeID: "tok-home",
        AwayID: "tok-away",
        HomeOdds: 0,
        AwayOdds: 0,
        Status: "Normal",
      },
      "pm-match-1",
    );

    expect(item.fallbackHomeOdds).toBe(0);
    expect(item.getOdds("Home")).toBe(1.95);
  });
});
