import type { BetOption } from "@/models/betOption";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { attachPolymarketDetectionQuote } from "@/domain/polymarket/attachDetectionQuote";
import { useOddsStore } from "@/stores/oddsStore";

function pmOption(data: Record<string, unknown> | null = null): BetOption {
  return {
    type: "Polymarket",
    itemId: "token-1",
    data,
  } as BetOption;
}

describe("attachPolymarketDetectionQuote", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("writes fo clobPrice before first checkBet", () => {
    const fo = useOddsStore();
    fo.save("Polymarket", {
      id: "token-1",
      odds: 1.4706,
      clobPrice: 0.68,
      isLock: false,
      time: Date.now(),
    }, "mqtt");

    const option = pmOption();
    attachPolymarketDetectionQuote(option);

    expect(option.data).toMatchObject({ detectionClobPrice: 0.68 });
  });

  test("does not overwrite locked detection cap on PM recheck", () => {
    const fo = useOddsStore();
    fo.save("Polymarket", {
      id: "token-1",
      odds: 1.4493,
      clobPrice: 0.69,
      isLock: false,
      time: Date.now(),
    }, "mqtt");

    const option = pmOption({
      detectionOdds: 1.471,
      detectionMaxPrice: 0.68,
      detectionClobPrice: 0.68,
      tokenId: "token-1",
      side: "BUY",
    });
    attachPolymarketDetectionQuote(option);

    expect(option.data).toMatchObject({
      detectionOdds: 1.471,
      detectionMaxPrice: 0.68,
      detectionClobPrice: 0.68,
    });
  });
});
