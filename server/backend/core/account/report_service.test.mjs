import { describe, expect, it, vi } from "vitest";

vi.mock("@changmen/db", () => ({
  fetchOrdersForMonthAggregate: vi.fn(async (_month, userId) => {
    const siteOrders = [
      { create_at: new Date("2026-06-13T10:00:00").getTime(), money: 100, bet_money: 1000, status: "Win" },
      { create_at: new Date("2026-06-13T15:00:00").getTime(), money: 50, bet_money: 500, status: "Win" },
      { create_at: new Date("2026-06-14T12:00:00").getTime(), money: -20, bet_money: 200, status: "Lose" },
      { create_at: new Date("2026-06-13T18:00:00").getTime(), money: 999, bet_money: 999, status: "Reject" },
    ];
    const user2Orders = [
      { create_at: new Date("2026-06-15T12:00:00").getTime(), money: 200, bet_money: 800, status: "Win" },
    ];
    if (userId === "u2") return user2Orders;
    if (userId) return [];
    return siteOrders;
  }),
  fetchMoneyLogsForMonthAggregate: vi.fn(async (_month, userId) => {
    if (userId === "u2") {
      return [{ create_at: new Date("2026-06-15T09:00:00").getTime(), type: "Recharge", money: 200 }];
    }
    if (userId) return [];
    return [
      { create_at: new Date("2026-06-13T08:00:00").getTime(), type: "Recharge", money: 5000 },
      { create_at: new Date("2026-06-13T20:00:00").getTime(), type: "Withdraw", money: 1000 },
      { create_at: new Date("2026-06-13T21:00:00").getTime(), type: "Lose", money: 30 },
      { create_at: new Date("2026-06-15T09:00:00").getTime(), type: "Recharge", money: 200 },
    ];
  }),
}));

import { getMonthReport } from "./report_service.js";

describe("getMonthReport", () => {
  it("aggregates orders and money logs by day with derived fields", async () => {
    const report = await getMonthReport("2026-06");
    expect(report.month).toBe("2026-06");
    expect(report.list).toHaveLength(30);

    const day13 = report.list.find((r) => new Date(r.Date).getDate() === 13);
    expect(day13.Profit).toBe(150);
    expect(day13.OrderCount).toBe(2);
    expect(day13.BetMoney).toBe(1500);
    expect(day13.Rate).toBeCloseTo(0.1);
    expect(day13.Deposit).toBe(5000);
    expect(day13.Withdraw).toBe(1000);
    expect(day13.Hacked).toBe(30);
    expect(day13.Wallet).toBe(4000);
    expect(day13.RealProfit).toBe(120);

    const day14 = report.list.find((r) => new Date(r.Date).getDate() === 14);
    expect(day14.Profit).toBe(-20);
    expect(day14.OrderCount).toBe(1);

    expect(report.total.Profit).toBe(130);
    expect(report.total.OrderCount).toBe(3);
    expect(report.total.BetMoney).toBe(1700);
    expect(report.total.Deposit).toBe(5200);
    expect(report.total.Withdraw).toBe(1000);
    expect(report.total.Hacked).toBe(30);
    expect(report.total.Wallet).toBe(4200);
    expect(report.total.RealProfit).toBe(100);
  });

  it("filters by userId when provided", async () => {
    const report = await getMonthReport("2026-06", "u2");
    expect(report.userId).toBe("u2");
    expect(report.total.Profit).toBe(200);
    expect(report.total.OrderCount).toBe(1);
    expect(report.total.Deposit).toBe(200);
    expect(report.total.Withdraw).toBe(0);
    expect(report.total.Hacked).toBe(0);
  });

  it("returns empty order stats for user with no orders in month", async () => {
    const report = await getMonthReport("2026-06", "admin-user");
    expect(report.userId).toBe("admin-user");
    expect(report.total.Profit).toBe(0);
    expect(report.total.OrderCount).toBe(0);
    expect(report.total.Deposit).toBe(0);
  });
});
