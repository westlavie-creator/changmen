import { describe, expect, it } from "vitest";
import { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import {
  polymarketCnyFromUsdt,
  polymarketUsdtFromCny,
  resolvePolymarketVenueStakeUsdc,
  round2Usdc,
} from "./pmStake";

describe("pmStake", () => {
  const pmAccount = new PlatformAccount({
    accountId: 1,
    provider: "Polymarket",
    playerName: "pm",
    currency: "USDT",
  });

  it("round2Usdc keeps two decimal places", () => {
    expect(round2Usdc(11.428571)).toBe(11.43);
    expect(round2Usdc(3.36237)).toBe(3.36);
  });

  it("polymarketCnyFromUsdt round-trips CNY plan at 2-decimal USDC", () => {
    expect(polymarketUsdtFromCny(pmAccount, 80, 2)).toBe(11.76);
    expect(polymarketCnyFromUsdt(11.76)).toBe(79.97);
    expect(polymarketUsdtFromCny(pmAccount, polymarketCnyFromUsdt(3.36), 2)).toBe(3.36);
  });

  it("polymarketUsdtFromCny applies account rate on USDC", () => {
    const rated = new PlatformAccount({
      accountId: 2,
      provider: "Polymarket",
      playerName: "pm-rated",
      currency: "USDT",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 0.5 }],
    });
    expect(polymarketUsdtFromCny(rated, 100, 2)).toBe(7.36);
  });

  it("polymarketUsdtFromCny can skip account rate for 9999 precheck", () => {
    const rated = new PlatformAccount({
      accountId: 3,
      provider: "Polymarket",
      playerName: "pm-9999",
      currency: "USDT",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    const nominal = polymarketUsdtFromCny(rated, 100, 2, true);
    expect(polymarketUsdtFromCny(rated, 100, 2)).toBeGreaterThan(nominal * 100);
    expect(nominal).toBe(14.71);
  });

  it("resolvePolymarketVenueStakeUsdc enforces min stake without extra rounding", () => {
    expect(resolvePolymarketVenueStakeUsdc(3.36)).toBe(3.36);
    expect(resolvePolymarketVenueStakeUsdc(0.5)).toBe(1);
  });
});
