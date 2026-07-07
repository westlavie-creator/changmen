import { describe, expect, it } from "vitest";
import { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import {
  resolveDisplayCnyFromVenueUsdc,
  resolvePlanCnyFromVenueOrder,
  resolvePlanCnyFromVenueStake,
  resolveVenueStakeFromPlanCny,
} from "./a8VenueMoney";

describe("a8VenueMoney (A8 adaptation)", () => {
  it("CNY account: plan passes through getBetMoney", () => {
    const acc = new PlatformAccount({
      accountId: 1,
      provider: "RAY",
      playerName: "r",
      currency: "CNY",
    });
    expect(resolveVenueStakeFromPlanCny(acc, 80, 1.36)).toBe(80);
    expect(resolvePlanCnyFromVenueStake(acc, 80)).toBe(80);
  });

  it("USDT account on A8 venue: plan ÷exchange for venue, ×exchange back to plan", () => {
    const acc = new PlatformAccount({
      accountId: 2,
      provider: "RAY",
      playerName: "u",
      currency: "USDT",
    });
    expect(resolveVenueStakeFromPlanCny(acc, 68, 2)).toBe(10);
    expect(resolvePlanCnyFromVenueStake(acc, 10)).toBe(68);
  });

  it("Polymarket: plan CNY ↔ USDC via pmStake", () => {
    const acc = new PlatformAccount({
      accountId: 3,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    expect(resolveVenueStakeFromPlanCny(acc, 98, 1.695)).toBe(14.41);
    expect(resolvePlanCnyFromVenueStake(acc, 14)).toBe(95.2);
  });

  it("resolvePlanCnyFromVenueOrder handles scaled and unscaled PM orders", () => {
    const acc = new PlatformAccount({
      accountId: 3,
      provider: "Polymarket",
      playerName: "pm",
      currency: "USDT",
    });
    expect(
      resolvePlanCnyFromVenueOrder(acc, {
        betMoney: 14,
        pmStakeUsdc: 14,
      } as never),
    ).toBe(95.2);
    expect(
      resolvePlanCnyFromVenueOrder(acc, {
        betMoney: 98,
        pmStakeUsdc: 14,
      } as never),
    ).toBe(98);
  });

  it("resolveDisplayCnyFromVenueUsdc uses shared exchange", () => {
    expect(resolveDisplayCnyFromVenueUsdc(14)).toBe(95.2);
  });
});
