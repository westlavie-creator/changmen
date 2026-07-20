import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pf_wallet_events.js", () => ({
  ensureHouseWalletEventsStarted: vi.fn(),
  getHouseWalletSettlementHint: vi.fn(() => null),
  waitForHouseWalletSettlementHint: vi.fn(async () => null),
  officialStubFromWalletHint: vi.fn(() => null),
}));

import {
  isOpenChangmenOrderStatus,
  isPredictOfficialTerminal,
  mapPredictOfficialStatusToVenue,
  mapPredictOrderToVenueOrder,
  settlementFromPredictOfficialStatus,
  waitForHouseOrderTerminal,
  fetchHousePredictOrderResolved,
} from "./pf_orders.js";
import {
  getHouseWalletSettlementHint,
  officialStubFromWalletHint,
} from "./pf_wallet_events.js";

beforeEach(() => {
  getHouseWalletSettlementHint.mockReset();
  getHouseWalletSettlementHint.mockReturnValue(null);
  officialStubFromWalletHint.mockReset();
  officialStubFromWalletHint.mockReturnValue(null);
});

describe("pf_orders official status mapping", () => {
  it("maps OrderStatus to VenueOrder.status", () => {
    expect(mapPredictOfficialStatusToVenue("FILLED")).toBe("none");
    expect(mapPredictOfficialStatusToVenue("OPEN")).toBe("pending");
    expect(mapPredictOfficialStatusToVenue("CANCELLED")).toBe("reject");
    expect(mapPredictOfficialStatusToVenue("EXPIRED")).toBe("reject");
    expect(mapPredictOfficialStatusToVenue("INVALIDATED")).toBe("reject");
  });

  it("maps OrderStatus to leg settlement", () => {
    expect(settlementFromPredictOfficialStatus("FILLED")).toBe("filled");
    expect(settlementFromPredictOfficialStatus("OPEN")).toBe("timeout");
    expect(settlementFromPredictOfficialStatus("CANCELLED")).toBe("unfilled");
    expect(settlementFromPredictOfficialStatus("EXPIRED")).toBe("unfilled");
  });

  it("detects terminal statuses", () => {
    expect(isPredictOfficialTerminal("FILLED")).toBe(true);
    expect(isPredictOfficialTerminal("CANCELLED")).toBe(true);
    expect(isPredictOfficialTerminal("OPEN")).toBe(false);
  });

  it("open changmen statuses are refundable", () => {
    expect(isOpenChangmenOrderStatus("None")).toBe(true);
    expect(isOpenChangmenOrderStatus("Pending")).toBe(true);
    expect(isOpenChangmenOrderStatus("Reject")).toBe(false);
  });

  it("maps official row + rds into VenueOrder", () => {
    const venue = mapPredictOrderToVenueOrder(
      {
        id: "api-1",
        status: "FILLED",
        marketId: 830202,
        amountFilled: "1",
        order: { hash: "0xabc", tokenId: "tok" },
      },
      {
        orderId: "0xabc",
        odds: 2.5,
        betMoney: 10,
        createAt: 100,
        Link: 42,
      },
    );
    expect(venue.orderId).toBe("0xabc");
    expect(venue.status).toBe("none");
    expect(venue.link).toBe(42);
    // 无 MarketIndex 时：短 token 原样；裸 marketId →「市场 N」
    expect(venue.item).toBe("tok");
    expect(venue.match).toBe("市场 830202");
  });

  it("waitForHouseOrderTerminal stops on FILLED", async () => {
    let n = 0;
    const official = await waitForHouseOrderTerminal("0xabc", {
      attempts: 5,
      intervalMs: 1,
      fetchOrder: async () => {
        n += 1;
        return n < 2 ? { status: "OPEN" } : { status: "FILLED", amountFilled: "1" };
      },
    });
    expect(official?.status).toBe("FILLED");
    expect(n).toBe(2);
  });

  it("waitForHouseOrderTerminal uses wallet hint when REST lags", async () => {
    getHouseWalletSettlementHint.mockReturnValue({
      orderHash: "0xabc",
      settlement: "filled",
      type: "orderTransactionSuccess",
      executedSizeWei: "10",
    });
    officialStubFromWalletHint.mockReturnValue({
      status: "FILLED",
      order: { hash: "0xabc" },
    });
    const official = await waitForHouseOrderTerminal("0xabc", {
      attempts: 3,
      intervalMs: 1,
      fetchOrder: async () => ({ status: "OPEN" }),
    });
    expect(official?.status).toBe("FILLED");
  });

  it("fetchHousePredictOrderResolved uses wallet stub when REST still OPEN", async () => {
    getHouseWalletSettlementHint.mockReturnValue({
      orderHash: "0xbuy",
      settlement: "unfilled",
      type: "orderCancelled",
    });
    officialStubFromWalletHint.mockReturnValue({
      status: "CANCELLED",
      order: { hash: "0xbuy" },
    });
    let n = 0;
    const official = await fetchHousePredictOrderResolved("0xbuy", {
      fetchOrder: async () => {
        n += 1;
        return { status: "OPEN", id: "1" };
      },
    });
    expect(official?.status).toBe("CANCELLED");
    // wallet-first 拒单：不必打 REST
    expect(n).toBe(0);
  });

  it("fetchHousePredictOrderResolved prefers REST when wallet says filled", async () => {
    getHouseWalletSettlementHint.mockReturnValue({
      orderHash: "0xfill",
      settlement: "filled",
      type: "orderTransactionSuccess",
    });
    officialStubFromWalletHint.mockReturnValue({
      status: "FILLED",
      order: { hash: "0xfill" },
    });
    const official = await fetchHousePredictOrderResolved("0xfill", {
      fetchOrder: async () => ({ status: "FILLED", amountFilled: "9" }),
    });
    expect(official?.status).toBe("FILLED");
    expect(official?.amountFilled).toBe("9");
  });
});
