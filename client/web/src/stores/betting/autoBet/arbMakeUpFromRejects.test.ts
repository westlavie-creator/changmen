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

import { createDefaultUserConfig } from "@/types/userConfig";

function params(): ArbBetAttemptParams {
  return {
    match: { id: 1, title: "A vs B" } as never,
    bet: { id: 100, getBetName: () => "地图1" } as never,
    config: { ...createDefaultUserConfig(), makeUp: true } as never,
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
    enqueueMakeUpOrder.mockResolvedValue(true);
  });

  it("enqueues venue-confirmed success leg reference when B wins and A fails", async () => {
    const out = await applyArbMakeUpFromRejects(
      params(),
      basePlaced(),
      false,
      false,
      {
        ordersA: [],
        ordersB: [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      },
    );

    expect(out).toEqual({ enqueuedForLegA: true, enqueuedForLegB: false });
    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "Home",
        betMoney: 70,
        betOdds: 4.095,
        accountId: 23,
      }),
    );
  });

  it("passes success leg orderId when resolving venue reference", async () => {
    const placed = basePlaced();
    placed.resultB = Object.assign(new BetResult("OB", true), { orderId: "0xsuccess" });

    await applyArbMakeUpFromRejects(
      params(),
      placed,
      false,
      false,
      {
        ordersA: [],
        ordersB: [
          { orderId: "0xold", betMoney: 10, odds: 2.6, status: "reject" } as never,
          { orderId: "0xsuccess", betMoney: 70, odds: 4.095, status: "none" } as never,
        ],
      },
    );

    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        betMoney: 70,
        betOdds: 4.095,
      }),
    );
  });

  it("returns false when makeup threshold rejects enqueue", async () => {
    enqueueMakeUpOrder.mockResolvedValueOnce(false);

    const out = await applyArbMakeUpFromRejects(
      params(),
      basePlaced(),
      false,
      false,
      {
        ordersA: [],
        ordersB: [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      },
    );

    expect(out).toEqual({ enqueuedForLegA: false, enqueuedForLegB: false });
  });

  it("skips enqueue when makeUp is disabled", async () => {
    const p = params();
    p.config = { ...createDefaultUserConfig(), makeUp: false } as never;

    const out = await applyArbMakeUpFromRejects(
      p,
      basePlaced(),
      false,
      false,
      {
        ordersA: [],
        ordersB: [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      },
    );

    expect(out).toEqual({ enqueuedForLegA: false, enqueuedForLegB: false });
    expect(enqueueMakeUpOrder).not.toHaveBeenCalled();
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

  it("enqueues when PM leg has settlement reject but venue reject flag is false", async () => {
    const placed = basePlaced();
    placed.legA = new BetOption("Polymarket" as never, "m1", "b1", "h1", 40, "Home", 1.36);
    placed.legB = new BetOption("OB" as never, "m2", "b2", "a1", 70, "Away", 4.095);
    placed.accountA = { accountId: 14 } as never;
    placed.accountB = { accountId: 23 } as never;
    placed.resultA = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm-unfilled",
      reject: "unfilled",
    });
    placed.resultB = new BetResult("OB", true);

    const out = await applyArbMakeUpFromRejects(
      params(),
      placed,
      false,
      false,
      {
        ordersA: [],
        ordersB: [{ betMoney: 70, odds: 4.095, status: "none" } as never],
      },
    );

    expect(out).toEqual({ enqueuedForLegA: true, enqueuedForLegB: false });
    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 23,
        betMoney: 70,
      }),
    );
  });

  it("enqueues RAY makeup when RAY rejected and PM still pending confirm", async () => {
    const placed = basePlaced();
    placed.legA = new BetOption("RAY" as never, "m1", "b1", "h1", 55, "Home", 2.81);
    placed.legB = new BetOption("Polymarket" as never, "m2", "b2", "a1", 26, "Away", 1.72);
    placed.resultA = new BetResult("RAY", true);
    placed.resultB = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm-delayed",
      pending: true,
    });

    const out = await applyArbMakeUpFromRejects(
      params(),
      placed,
      true,
      false,
      {
        ordersA: [{ betMoney: 55, odds: 2.81, status: "reject" } as never],
        ordersB: [],
        pendingConfirmB: true,
      },
    );

    expect(out).toEqual({ enqueuedForLegA: true, enqueuedForLegB: false });
    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "Home",
        accountId: 23,
        failedPlatformLabel: "RAY",
      }),
    );
  });
});
