import { describe, expect, it } from "vitest";
import { dedupeOrdersByUserOrderId } from "./profit_cny.js";

describe("dedupeOrdersByUserOrderId", () => {
  it("keeps one row per user_id + order_id (case-insensitive)", () => {
    const rows = dedupeOrdersByUserOrderId([
      { id: 1, user_id: "u1", order_id: "ABC", money: -100, status: "Lose" },
      { id: 9, user_id: "u1", order_id: "abc", money: -100, status: "Lose" },
      { id: 2, user_id: "u2", order_id: "abc", money: 50, status: "Win" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.user_id === "u1")?.id).toBe(9);
    expect(rows.find(r => r.user_id === "u2")?.id).toBe(2);
  });

  it("prefers non-Reject when duplicate", () => {
    const rows = dedupeOrdersByUserOrderId([
      { id: 10, user_id: "u1", order_id: "x", money: 0, status: "Reject" },
      { id: 5, user_id: "u1", order_id: "x", money: 12, status: "Win" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Win");
    expect(rows[0].id).toBe(5);
  });
});
