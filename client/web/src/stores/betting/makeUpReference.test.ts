import type { BetOption } from "@/models/betOption";
import { describe, expect, it } from "vitest";
import { LoseOrder } from "@/models/loseOrder";
import {
  resolveMakeUpHedgeStake,
  resolveMakeUpSuccessReference,
} from "@/stores/betting/makeUpReference";

function leg(betMoney: number, odds: number, newOdds?: number): BetOption {
  return {
    betMoney,
    odds,
    newOdds,
  } as BetOption;
}

describe("resolveMakeUpSuccessReference", () => {
  it("prefers venue order stake and odds when not rejected", () => {
    const ref = resolveMakeUpSuccessReference(
      leg(30, 1.35),
      [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      false,
    );
    expect(ref).toEqual({ betMoney: 70, betOdds: 4.095 });
  });

  it("falls back to leg newOdds when venue sync is empty", () => {
    const ref = resolveMakeUpSuccessReference(
      leg(70, 4, 4.095),
      [],
      false,
    );
    expect(ref).toEqual({ betMoney: 70, betOdds: 4.095 });
  });

  it("falls back to leg when success leg was rejected", () => {
    const ref = resolveMakeUpSuccessReference(
      leg(70, 4.095),
      [{ betMoney: 70, odds: 4.095, status: "reject" } as never],
      true,
    );
    expect(ref).toEqual({ betMoney: 70, betOdds: 4.095 });
  });

  it("converts PM leg betMoney from USDT to CNY on fallback", () => {
    const pmAccount = {
      provider: "Polymarket",
      currency: "USDT",
    } as never;
    const ref = resolveMakeUpSuccessReference(
      { betMoney: 14, odds: 1.695, type: "Polymarket" } as BetOption,
      [],
      false,
      pmAccount,
    );
    expect(ref).toEqual({ betMoney: 98, betOdds: 1.695 });
  });
});

describe("resolveMakeUpHedgeStake", () => {
  it("recomputes hedge from live odds (GB12 TTG scenario)", () => {
    const order = new LoseOrder({
      betMoney: 70,
      betOdds: 4.095,
      target: "Home",
      isCreateOrder: false,
    });
    expect(resolveMakeUpHedgeStake(order, 1.35)).toBe(212);
  });

  it("keeps manual create order stake", () => {
    const order = new LoseOrder({
      betMoney: 88,
      betOdds: 3.5,
      target: "Home",
      isCreateOrder: true,
    });
    expect(resolveMakeUpHedgeStake(order, 1.35)).toBe(88);
  });
});
