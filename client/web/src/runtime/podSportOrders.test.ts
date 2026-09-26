import { describe, expect, it } from "vitest";
import {
  POD_SPORT_ORDERS_MAX,
  formatPodSportOrderMeta,
  groupPodSportOrders,
  mergePodSportOrder,
  parsePodSportOrders,
  summarizePodSportOrders,
} from "@/runtime/podSportOrders";

const row = {
  id: "a1",
  orderId: "8821",
  at: 1_970_000,
  home: "Arsenal",
  away: "Chelsea",
  sideLabel: "大 2.5",
  marketLabel: "全场 大小 2.5",
  odds: 1.95,
  stake: 50,
  oid: "oid-over",
  obMid: "5652292",
  auto: true,
  status: "None" as const,
  profit: 0,
};

describe("podSportOrders", () => {
  it("parses and merges football orders in memory without esport save fields", () => {
    expect(parsePodSportOrders([{ id: "x" }, { id: "x", orderId: "1" }])).toHaveLength(1);
    const once = mergePodSportOrder([], row);
    expect(once).toHaveLength(1);
    expect(mergePodSportOrder(once, row)).toHaveLength(1);
    expect(once[0].orderId).toBe("8821");
    expect(formatPodSportOrderMeta(row, 1_970_000 + 5_000)).toMatch(/自动/);
    expect(summarizePodSportOrders(once, 1_970_000).count).toBe(1);
    expect(summarizePodSportOrders(once, 1_970_000).todayStake).toBe(50);
    expect(summarizePodSportOrders(once, 1_970_000).todayProfit).toBe(0);
    expect(groupPodSportOrders(once)[0].legend).toBe("50");
    expect(groupPodSportOrders(once)[0].legendClass).toBe("default");
    expect(groupPodSportOrders(once)[0].key).toBe("5652292");
  });

  it("keeps settled status when a later None save merges", () => {
    const won = mergePodSportOrder([], { ...row, status: "Win", profit: 47.5 });
    const again = mergePodSportOrder(won, { ...row, status: "None", profit: 0 });
    expect(again[0].status).toBe("Win");
    expect(again[0].profit).toBe(47.5);
    expect(groupPodSportOrders(again)[0].legend).toBe("48");
    expect(groupPodSportOrders(again)[0].legendClass).toBe("success");
    expect(summarizePodSportOrders(again, 1_970_000).todayProfit).toBe(47.5);
  });

  it("keeps auto from numeric flags", () => {
    expect(parsePodSportOrders([{ id: "a", auto: 1, at: 1 }])[0].auto).toBe(true);
  });

  it("keeps the same 1024 daily rows as the esport order list", () => {
    const rows = Array.from({ length: 1100 }, (_, index) => ({
      ...row,
      id: `daily-${index}`,
      orderId: `venue-${index}`,
      at: index + 1,
    }));
    const parsed = parsePodSportOrders(rows);
    expect(POD_SPORT_ORDERS_MAX).toBe(1024);
    expect(parsed).toHaveLength(1024);
    expect(parsed[0]?.id).toBe("daily-1099");
  });
});
