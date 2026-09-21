import { describe, expect, it } from "vitest";
import { isFootballOrderRow, isUnifiedFootballOrderRow } from "@/shared/orderDomain";

describe("isFootballOrderRow", () => {
  it("recognizes explicit football domain metadata", () => {
    expect(isFootballOrderRow({
      Type: "OB",
      Domain: "sports",
      Sport: "football",
    })).toBe(true);
  });

  it("recognizes legacy Polymarket football totals orders", () => {
    expect(isFootballOrderRow({
      Type: "Polymarket",
      Match: "CA Rosario Central vs. AA Argentinos Juniors: O/U 1.5",
      Bet: "买单",
      Item: "Over",
    })).toBe(true);
  });

  it("does not mark esports teams as football", () => {
    expect(isFootballOrderRow({
      Type: "Polymarket",
      Match: "KT Challengers vs NS Esports Academy",
      Bet: "Winner",
      Item: "NS Esports Academy",
    })).toBe(false);
  });

  it("keeps OB football outside unified football orders", () => {
    expect(isUnifiedFootballOrderRow({
      Type: "OB",
      Domain: "sports",
      Sport: "football",
    })).toBe(false);
    expect(isUnifiedFootballOrderRow({
      Type: "Polymarket",
      Domain: "sports",
      Sport: "football",
    })).toBe(true);
  });
});
