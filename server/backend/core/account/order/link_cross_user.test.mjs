import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOrdersByLinks = vi.hoisted(() => vi.fn(async () => []));
const fetchOrdersByUserOrderIds = vi.hoisted(() => vi.fn(async () => []));
const fetchPredictionSellsByBuyOrderIds = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@changmen/db", () => ({
  fetchOrdersByLinks,
  fetchOrdersByUserOrderIds,
  fetchPredictionSellsByBuyOrderIds,
  backendBindLinkFromCreateAt: (n) => Number(n) || 0,
  isArbBindLink: () => false,
  placeholderLinkFromCreateAt: (ts) => Number(ts) || 0,
}));

describe("mergePredictionBuySellSiblings cross-user order_id", () => {
  beforeEach(() => {
    fetchOrdersByLinks.mockReset().mockResolvedValue([]);
    fetchOrdersByUserOrderIds.mockReset().mockResolvedValue([]);
    fetchPredictionSellsByBuyOrderIds.mockReset().mockResolvedValue([]);
  });

  it("keeps same venue order_id for different users when enriching all-users day", async () => {
    const { mergePredictionBuySellSiblings } = await import("./link.js");
    const dayStart = Date.parse("2026-07-29T00:00:00");
    const rows = [
      {
        id: 1,
        user_id: "user-a",
        order_id: "1844586837912993541",
        player_id: 255,
        provider: "OB",
        link: 100,
        money: 58,
        status: "Win",
        create_at: dayStart + 1000,
        raw: {},
      },
      {
        id: 2,
        user_id: "user-b",
        order_id: "1844586837912993541",
        player_id: 270,
        provider: "OB",
        link: 200,
        money: 58,
        status: "Win",
        create_at: dayStart + 2000,
        raw: {},
      },
    ];

    const merged = await mergePredictionBuySellSiblings(rows, {});
    expect(merged).toHaveLength(2);
    expect(merged.map(r => r.user_id).sort()).toEqual(["user-a", "user-b"]);
  });
});
