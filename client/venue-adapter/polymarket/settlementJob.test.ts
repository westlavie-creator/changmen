import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settlePolymarketDelayedOrder } from "./orderSettlement";
import { resolvePolymarketBuyFill } from "./orders";
import { placePolymarketAutoExitSell } from "./pmAutoExitSell";
import {
  awaitPolymarketSettlementJob,
  clearPolymarketSettlementJobs,
  startPolymarketSettlementJob,
} from "./settlementJob";

vi.mock("./orderSettlement", () => ({
  settlePolymarketDelayedOrder: vi.fn(),
}));

vi.mock("./orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./orders")>();
  return {
    ...actual,
    resolvePolymarketBuyFill: vi.fn(),
  };
});

vi.mock("./pmAutoExitSell", () => ({
  placePolymarketAutoExitSell: vi.fn(async () => ({ ok: true })),
}));

function pmAccount(accountId = 7): PlatformAccount {
  return { provider: "Polymarket", accountId } as PlatformAccount;
}

describe("settlementJob", () => {
  beforeEach(() => {
    vi.mocked(settlePolymarketDelayedOrder).mockReset();
    vi.mocked(resolvePolymarketBuyFill).mockReset();
    vi.mocked(placePolymarketAutoExitSell).mockReset();
    vi.mocked(placePolymarketAutoExitSell).mockResolvedValue({ ok: true } as any);
    clearPolymarketSettlementJobs();
  });

  afterEach(() => {
    clearPolymarketSettlementJobs();
  });

  it("start is idempotent for same accountId+orderId", async () => {
    vi.mocked(settlePolymarketDelayedOrder).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ outcome: "matched", row: { status: "MATCHED" } }), 20),
        ),
    );

    startPolymarketSettlementJob(pmAccount(), "0xabc");
    startPolymarketSettlementJob(pmAccount(), "0xabc");

    expect(settlePolymarketDelayedOrder).toHaveBeenCalledTimes(1);
    const out = await awaitPolymarketSettlementJob(pmAccount(), "0xabc");
    expect(out?.outcome).toBe("matched");
  });

  it("await returns null when no job was started", async () => {
    expect(await awaitPolymarketSettlementJob(pmAccount(), "0xmissing")).toBeNull();
  });

  it("different accounts with same orderId get separate jobs", () => {
    startPolymarketSettlementJob(pmAccount(1), "0xshared");
    startPolymarketSettlementJob(pmAccount(2), "0xshared");

    expect(settlePolymarketDelayedOrder).toHaveBeenCalledTimes(2);
  });

  it("does not place auto-exit sell until buy fill shares are confirmed", async () => {
    vi.useFakeTimers();
    vi.mocked(settlePolymarketDelayedOrder).mockResolvedValue({
      outcome: "matched",
      row: { status: "MATCHED", size_matched: "10" },
    });
    vi.mocked(resolvePolymarketBuyFill).mockResolvedValue({ stakeUsdc: 0, shares: 0 });

    startPolymarketSettlementJob(pmAccount(), "0xdelayed", {
      autoExitSell: { tokenId: "123456789" },
    });
    await awaitPolymarketSettlementJob(pmAccount(), "0xdelayed");
    await vi.runAllTimersAsync();

    expect(placePolymarketAutoExitSell).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("places auto-exit sell only after confirmed buy shares", async () => {
    vi.mocked(settlePolymarketDelayedOrder).mockResolvedValue({
      outcome: "matched",
      row: { status: "MATCHED", size_matched: "10" },
    });
    vi.mocked(resolvePolymarketBuyFill).mockResolvedValue({ stakeUsdc: 5, shares: 10 });

    startPolymarketSettlementJob(pmAccount(), "0xfilled", {
      autoExitSell: { tokenId: "123456789" },
    });
    await awaitPolymarketSettlementJob(pmAccount(), "0xfilled");
    await new Promise(r => setTimeout(r, 30));

    expect(placePolymarketAutoExitSell).toHaveBeenCalledWith({
      account: expect.objectContaining({ accountId: 7 }),
      buyOrderId: "0xfilled",
      tokenId: "123456789",
      shares: 10,
    });
  });
});
