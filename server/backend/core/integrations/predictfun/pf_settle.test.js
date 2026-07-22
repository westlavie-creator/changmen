import { describe, expect, it } from "vitest";
import { computePfSettlement, resolvePfMarketOutcome } from "./pf_settle.js";

describe("resolvePfMarketOutcome", () => {
  const market = {
    status: "RESOLVED",
    outcomes: [
      { onChainId: "tok-home", status: "WON", name: "Home" },
      { onChainId: "tok-away", status: "LOST", name: "Away" },
    ],
  };

  it("returns null when market not resolved", () => {
    expect(resolvePfMarketOutcome({ ...market, status: "REGISTERED" }, "tok-home")).toBeNull();
  });

  it("maps WON/LOST by onChainId", () => {
    expect(resolvePfMarketOutcome(market, "tok-home")).toBe("win");
    expect(resolvePfMarketOutcome(market, "tok-away")).toBe("lose");
  });

  it("returns null for unknown token", () => {
    expect(resolvePfMarketOutcome(market, "tok-x")).toBeNull();
  });
});

describe("computePfSettlement", () => {
  it("win payout = shares × $1 (price path); money is profit", () => {
    // 名义 14.12、买入价 0.32 → 44.125 份；台账 USDT 保留 2 位
    const r = computePfSettlement(14.12, { shares: 44.125, bookPrice: 0.32 }, "win");
    expect(r.status).toBe("win");
    expect(r.payout).toBe(44.13);
    expect(r.balanceDelta).toBe(44.13);
    expect(r.money).toBe(30.01);
  });

  it("win prefers hold shares over notional/price", () => {
    const r = computePfSettlement(14.12, { shares: 43.33075, bookPrice: 0.32 }, "win");
    expect(r.payout).toBe(43.33);
    expect(r.money).toBe(29.21);
  });

  it("win falls back to notional/price when shares missing", () => {
    const r = computePfSettlement(14.12, { bookPrice: 0.32 }, "win");
    expect(r.payout).toBe(44.13);
    expect(r.money).toBe(30.01);
  });

  it("lose keeps balance; money is -stake", () => {
    const r = computePfSettlement(14.12, { bookPrice: 0.32 }, "lose");
    expect(r.status).toBe("lose");
    expect(r.balanceDelta).toBe(0);
    expect(r.money).toBe(-14.12);
  });

  it("does not overwrite share payout with odds when shares < stake", () => {
    // 有份额就以份额为准；勿因 payout≤stake 误走赔率兜底
    const r = computePfSettlement(20, { shares: 10, odds: 3 }, "win");
    expect(r.payout).toBe(10);
    expect(r.money).toBe(-10);
  });

  it("legacy odds-only call still works when no shares/price", () => {
    const r = computePfSettlement(10, 2.5, "win");
    expect(r.payout).toBe(25);
    expect(r.money).toBe(15);
  });
});
