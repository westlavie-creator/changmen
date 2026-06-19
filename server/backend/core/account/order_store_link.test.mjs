import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchOrdersByPlayerAll = vi.hoisted(() => vi.fn(async () => []));
const upsertOrders = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@changmen/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchOrdersByPlayerAll,
    upsertOrders,
  };
});

import { saveOrder } from "./order_store.js";

describe("saveOrder backend bind link", () => {
  beforeEach(() => {
    fetchOrdersByPlayerAll.mockReset();
    upsertOrders.mockReset();
    fetchOrdersByPlayerAll.mockResolvedValue([]);
    upsertOrders.mockResolvedValue(true);
  });

  it("sets link just before create_at for new unbound order", async () => {
    const createAt = 1_781_882_462_790;
    await saveOrder(
      7,
      [{ orderId: "venue-1", createAt, provider: "OB", status: "Pending" }],
      "user-1",
    );

    expect(upsertOrders).toHaveBeenCalledOnce();
    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(createAt - 1);
    expect(row.link).toBeLessThan(createAt);
    expect(row.create_at).toBe(createAt);
  });

  it("keeps existing bound link on re-save", async () => {
    const createAt = 1_781_882_462_790;
    const arbLink = 1_781_882_500_000;
    fetchOrdersByPlayerAll.mockResolvedValue([
      { order_id: "venue-1", link: arbLink, create_at: createAt },
    ]);

    await saveOrder(
      7,
      [{ orderId: "venue-1", createAt, provider: "OB" }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(arbLink);
  });

  it("backend-binds when existing link is 0", async () => {
    const createAt = 1_781_882_462_790;
    fetchOrdersByPlayerAll.mockResolvedValue([
      { order_id: "venue-2", link: 0, create_at: createAt },
    ]);

    await saveOrder(
      7,
      [{ orderId: "venue-2", createAt, provider: "RAY" }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(createAt - 1);
  });
});
