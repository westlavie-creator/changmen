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
  it("win payout = truncated hold shares × $1 (no round-up)", () => {
    // 名义 14.12、买入价 0.32 → 44.125 份；回款截断两位
    const r = computePfSettlement(14.12, { shares: 44.125, bookPrice: 0.32 }, "win");
    expect(r.status).toBe("win");
    expect(r.payout).toBe(44.12);
    expect(r.balanceDelta).toBe(44.12);
    expect(r.money).toBe(30);
  });

  it("win prefers hold shares; truncates 43.33075 → 43.33", () => {
    const r = computePfSettlement(14.12, { shares: 43.33075, bookPrice: 0.32 }, "win");
    expect(r.payout).toBe(43.33);
    expect(r.money).toBe(29.21);
  });

  it("does not round up truncated shares (43.339 → 43.33)", () => {
    const r = computePfSettlement(14.12, { shares: 43.339 }, "win");
    expect(r.payout).toBe(43.33);
  });

  it("win falls back to notional/price when shares missing", () => {
    const r = computePfSettlement(14.12, { bookPrice: 0.32 }, "win");
    expect(r.payout).toBe(44.12);
    expect(r.money).toBe(30);
  });

  it("lose keeps balance; money is -stake", () => {
    const r = computePfSettlement(14.12, { bookPrice: 0.32 }, "lose");
    expect(r.status).toBe("lose");
    expect(r.balanceDelta).toBe(0);
    expect(r.money).toBe(-14.12);
  });

  it("does not use odds when shares present (even if shares < stake)", () => {
    const r = computePfSettlement(20, { shares: 10, bookPrice: 0.5 }, "win");
    expect(r.payout).toBe(10);
    expect(r.money).toBe(-10);
  });

  it("ignores legacy numeric odds arg; no shares/price → payout=stake", () => {
    const r = computePfSettlement(10, 2.5, "win");
    expect(r.payout).toBe(10);
    expect(r.money).toBe(0);
  });
});
