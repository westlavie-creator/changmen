import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";

const enqueueMakeUpOrder = vi.hoisted(() => vi.fn());

vi.mock("@/stores/betting/autoBet/makeUp", () => ({
  enqueueMakeUpOrder,
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({ orders: new Map() }),
}));

function params(): ArbBetAttemptParams {
  return {
    match: { id: 1, title: "A vs B" } as never,
    bet: { id: 100, getBetName: () => "地图1" } as never,
    config: {} as never,
    setMessage: vi.fn(),
  };
}

function basePlaced(): ArbBetPlaced {
  const legA = new BetOption("RAY" as never, "m1", "b1", "h1", 40, "Home", 1.36);
  const legB = new BetOption("OB" as never, "m2", "b2", "a1", 70, "Away", 4.095);
  return {
    legA,
    legB,
    accountA: { accountId: 14 } as never,
    accountB: { accountId: 23 } as never,
    betBothLegs: true,
    linkId: 1782972494104,
    implied: 1.05,
    singleLegByRate: false,
    waitSec: 10,
    resultA: new BetResult("RAY", false),
    resultB: new BetResult("OB", true),
  };
}

describe("applyArbMakeUpFromRejects", () => {
  beforeEach(() => {
    enqueueMakeUpOrder.mockReset();
    enqueueMakeUpOrder.mockResolvedValue(undefined);
  });

  it("enqueues venue-confirmed success leg reference when B wins and A fails", async () => {
    await applyArbMakeUpFromRejects(
      params(),
      basePlaced(),
      false,
      false,
      {
        ordersA: [],
        ordersB: [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      },
    );

    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "Home",
        betMoney: 70,
        betOdds: 4.095,
        accountId: 23,
      }),
    );
  });

  it("ignores polluted leg betMoney when venue order is available", async () => {
    const placed = basePlaced();
    placed.legB.betMoney = 30;
    placed.legB.odds = 1.35;

    await applyArbMakeUpFromRejects(
      params(),
      placed,
      false,
      false,
      {
        ordersA: [],
        ordersB: [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      },
    );

    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        betMoney: 70,
        betOdds: 4.095,
      }),
    );
  });
});
