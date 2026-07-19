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
  it("win credits full payout; money is profit", () => {
    const r = computePfSettlement(10, 2.5, "win");
    expect(r.status).toBe("win");
    expect(r.payout).toBe(25);
    expect(r.balanceDelta).toBe(25);
    expect(r.money).toBe(15);
  });

  it("lose keeps balance; money is -stake", () => {
    const r = computePfSettlement(10, 2.5, "lose");
    expect(r.status).toBe("lose");
    expect(r.balanceDelta).toBe(0);
    expect(r.money).toBe(-10);
  });
});
