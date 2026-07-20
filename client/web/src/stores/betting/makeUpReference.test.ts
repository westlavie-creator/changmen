import type { BetOption } from "@changmen/client-core/models/betOption";
import { describe, expect, it } from "vitest";
import { resolveMakeUpSuccessReference } from "@/stores/betting/makeUpReference";

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

  it("anchors venue reference to successOrderId when list has stale rows", () => {
    const ref = resolveMakeUpSuccessReference(
      leg(30, 1.35),
      [
        { orderId: "0xold", betMoney: 10, odds: 2.6, status: "reject" } as never,
        { orderId: "0xnew", betMoney: 70, odds: 4.095, status: "none" } as never,
      ],
      false,
      undefined,
      "0xnew",
    );
    expect(ref).toEqual({ betMoney: 70, betOdds: 4.095 });
  });

  it("falls back to leg when successOrderId is absent from venue list", () => {
    const ref = resolveMakeUpSuccessReference(
      leg(70, 4, 4.095),
      [{ orderId: "0xold", betMoney: 10, odds: 2.6, status: "reject" } as never],
      false,
      undefined,
      "0xnew",
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
    expect(ref).toEqual({ betMoney: 95.2, betOdds: 1.695 });
  });

  it("converts PF leg betMoney from USDT to CNY on fallback (same as PM)", () => {
    const pfAccount = {
      provider: "PredictFun",
      currency: "USDT",
    } as never;
    const ref = resolveMakeUpSuccessReference(
      { betMoney: 1.47, odds: 1.6, type: "PredictFun" } as BetOption,
      [],
      false,
      pfAccount,
    );
    expect(ref).toEqual({ betMoney: 10, betOdds: 1.6 });
  });

  it("converts unscaled PM venue order USDC to CNY", () => {
    const pmAccount = {
      provider: "Polymarket",
      currency: "USDT",
    } as never;
    const ref = resolveMakeUpSuccessReference(
      { betMoney: 14, odds: 1.695, type: "Polymarket" } as BetOption,
      [{ betMoney: 14, odds: 1.695, status: "none", pmStakeUsdc: 14 } as never],
      false,
      pmAccount,
    );
    expect(ref).toEqual({ betMoney: 95.2, betOdds: 1.695 });
  });

  it("keeps scaled PM venue order CNY betMoney", () => {
    const pmAccount = {
      provider: "Polymarket",
      currency: "USDT",
    } as never;
    const ref = resolveMakeUpSuccessReference(
      { betMoney: 14, odds: 1.695, type: "Polymarket" } as BetOption,
      [{ betMoney: 98, odds: 1.695, status: "none", pmStakeUsdc: 14 } as never],
      false,
      pmAccount,
    );
    expect(ref).toEqual({ betMoney: 98, betOdds: 1.695 });
  });
});

