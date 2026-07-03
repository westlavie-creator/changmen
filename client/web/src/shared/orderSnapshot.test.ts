import { describe, expect, it } from "vitest";
import {
  buildOrderListSnapshot,
  flattenOrderMap,
  sameOrderList,
} from "@/shared/orderSnapshot";
import { groupOrdersByLink } from "@/shared/orderLink";

describe("orderSnapshot", () => {
  const rowA = {
    OrderID: "a",
    Link: 100,
    Type: "OB",
    Match: "m1",
    Bet: "b1",
    Item: "i1",
    Odds: 2.1,
    BetMoney: 100,
    Money: 10,
    Status: "None",
    CreateAt: 1_700_000_000_000,
    PlayerID: 1,
  };

  const rowB = {
    OrderID: "b",
    Link: 100,
    Type: "RAY",
    Match: "m2",
    Bet: "b2",
    Item: "i2",
    Odds: 2.0,
    BetMoney: 100,
    Money: -5,
    Status: "Win",
    CreateAt: 1_700_000_000_100,
    PlayerID: 2,
  };

  it("treats reordered lists as equal", () => {
    expect(sameOrderList([rowA, rowB], [rowB, rowA])).toBe(true);
  });

  it("detects status change", () => {
    expect(
      sameOrderList([rowA], [{ ...rowA, Status: "Win" }]),
    ).toBe(false);
  });

  it("detects length change", () => {
    expect(sameOrderList([rowA], [rowA, rowB])).toBe(false);
  });

  it("flattenOrderMap round-trips grouping", () => {
    const map = groupOrdersByLink([rowA, rowB]);
    expect(sameOrderList(flattenOrderMap(map), [rowA, rowB])).toBe(true);
  });

  it("snapshot is stable for identical content", () => {
    const s1 = buildOrderListSnapshot([rowB, rowA]);
    const s2 = buildOrderListSnapshot([rowA, rowB]);
    expect(s1).toBe(s2);
  });
});
