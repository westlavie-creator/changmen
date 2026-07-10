import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";

const enqueueMakeUpOrder = vi.hoisted(() => vi.fn());
const setPendingPmOrder = vi.hoisted(() => vi.fn());
const useLoseOrderStore = vi.hoisted(() =>
  vi.fn(() => ({
    orders: new Map(),
    setPendingPmOrder,
  })),
);

vi.mock("@/stores/betting/autoBet/makeUp", () => ({
  enqueueMakeUpOrder,
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore,
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
    placeOutcomeA: "api_failed",
    placeOutcomeB: "filled_pending_settle",
  };
}

describe("applyArbMakeUpFromRejects", () => {
  beforeEach(() => {
    enqueueMakeUpOrder.mockReset();
    enqueueMakeUpOrder.mockResolvedValue(true);
    setPendingPmOrder.mockReset();
    useLoseOrderStore.mockReset();
    useLoseOrderStore.mockReturnValue({
      orders: new Map(),
      setPendingPmOrder,
    });
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

  it("always enqueues when pairing requests makeup (threshold checked in jb)", async () => {
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
    expect(enqueueMakeUpOrder).toHaveBeenCalled();
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
    placed.placeOutcomeA = "filled_pending_settle";
    placed.placeOutcomeB = "filled_pending_settle";

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

  it("enqueues RAY makeup when RAY venue reject and PM filled", async () => {
    const placed = basePlaced();
    placed.legA = new BetOption("RAY" as never, "m1", "b1", "h1", 55, "Home", 2.81);
    placed.legB = new BetOption("Polymarket" as never, "m2", "b2", "a1", 26, "Away", 1.72);
    placed.resultA = new BetResult("RAY", true);
    placed.resultB = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm-filled",
    });
    placed.placeOutcomeA = "filled_pending_settle";
    placed.placeOutcomeB = "filled_pending_settle";

    const out = await applyArbMakeUpFromRejects(
      params(),
      placed,
      true,
      false,
      {
        ordersA: [{ betMoney: 55, odds: 2.81, status: "reject" } as never],
        ordersB: [{ betMoney: 26, odds: 1.72, status: "none" } as never],
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

  it("enqueues PM makeup when OB filled and PM confirmed unfilled", async () => {
    const placed = basePlaced();
    placed.legA = new BetOption("OB" as never, "m1", "b1", "h1", 70, "Home", 2);
    placed.legB = new BetOption("Polymarket" as never, "m2", "b2", "a1", 26, "Away", 1.72);
    placed.resultA = new BetResult("OB", true);
    placed.resultB = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm-unfilled",
    });
    placed.placeOutcomeA = "filled_pending_settle";
    placed.placeOutcomeB = "filled_pending_settle";

    const out = await applyArbMakeUpFromRejects(
      params(),
      placed,
      false,
      true,
      {
        ordersA: [{ betMoney: 70, odds: 2, status: "none" } as never],
        ordersB: [],
      },
    );

    expect(out).toEqual({ enqueuedForLegA: false, enqueuedForLegB: true });
    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "Away",
        accountId: 14,
        failedPlatformLabel: "Polymarket",
      }),
    );
  });

  it("hangs pendingPm resume when OB filled and PM still timeout/pendingConfirm", async () => {
    const placed = basePlaced();
    placed.accountA = { accountId: 14, provider: "OB" } as never;
    placed.accountB = { accountId: 99, provider: "Polymarket" } as never;
    placed.legA = new BetOption("OB" as never, "m1", "b1", "h1", 70, "Home", 2);
    placed.legB = new BetOption("Polymarket" as never, "m2", "b2", "a1", 26, "Away", 1.72);
    placed.resultA = new BetResult("OB", true);
    placed.resultB = Object.assign(new BetResult("Polymarket", true), {
      orderId: "0xpm-timeout",
      reject: "timeout",
    });
    placed.placeOutcomeA = "filled_pending_settle";
    placed.placeOutcomeB = "filled_pending_settle";

    const out = await applyArbMakeUpFromRejects(
      params(),
      placed,
      false,
      false,
      {
        ordersA: [{ betMoney: 70, odds: 2, status: "none" } as never],
        ordersB: [],
      },
      { pendingConfirmA: false, pendingConfirmB: true },
    );

    expect(out).toEqual({ enqueuedForLegA: false, enqueuedForLegB: true });
    expect(enqueueMakeUpOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "Away",
        accountId: 14,
        failedPlatformLabel: "Polymarket(待确认续查)",
      }),
    );
    expect(setPendingPmOrder).toHaveBeenCalledWith(100, "0xpm-timeout", 99);
  });
});
