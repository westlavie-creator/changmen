import { describe, expect, it } from "vitest";
import { groupOrdersByLink, isLinkedArbOrderGroup } from "@/shared/orderLink";

describe("orderStore arb link grouping", () => {
  it("groups two legs with the same Link into one fieldset bucket", () => {
    const link = 1_710_000_000_999;
    const grouped = groupOrdersByLink([
      { OrderID: "a", Link: link, Type: "OB", PlayerID: 1, Status: "None", BetMoney: 100, Odds: 2.1 },
      { OrderID: "b", Link: link, Type: "RAY", PlayerID: 2, Status: "None", BetMoney: 100, Odds: 2.0 },
    ]);
    expect(grouped.size).toBe(1);
    expect(grouped.get(link)?.length).toBe(2);
  });

  it("keeps unbound legs separate when Link differs", () => {
    const grouped = groupOrdersByLink([
      { OrderID: "a", Link: 111, Type: "OB" },
      { OrderID: "b", Link: 222, Type: "RAY" },
    ]);
    expect(grouped.size).toBe(2);
  });
});

describe("isLinkedArbGroup", () => {
  it("detects cross-platform legs on same Link", () => {
    expect(
      isLinkedArbOrderGroup([
        { Link: 123, OrderID: "a", Type: "OB" },
        { Link: 123, OrderID: "b", Type: "RAY" },
      ]),
    ).toBe(true);
  });

  it("PM buy+sell same Link is grouped but not arb paired styling", () => {
    expect(
      isLinkedArbOrderGroup([
        { Link: 123, OrderID: "buy", Type: "Polymarket", PmSide: "buy" },
        { Link: 123, OrderID: "sell", Type: "Polymarket", PmSide: "sell" },
      ]),
    ).toBe(false);
  });

  it("rejects single-leg negative link", () => {
    expect(isLinkedArbOrderGroup([{ Link: -123, OrderID: "a" }])).toBe(false);
  });
});
