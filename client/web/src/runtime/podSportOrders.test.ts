import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendPodSportOrder,
  formatPodSportOrderMeta,
  parsePodSportOrders,
  POD_SPORT_ORDERS_KEY,
  readPodSportOrders,
  summarizePodSportOrders,
} from "@/runtime/podSportOrders";

const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => { mem.set(key, String(value)); },
    removeItem: (key: string) => { mem.delete(key); },
  });
});

describe("podSportOrders", () => {
  it("appends a placed football order once and skips esport save fields", () => {
    expect(readPodSportOrders()).toEqual([]);
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
    };
    expect(appendPodSportOrder(row)).toHaveLength(1);
    expect(appendPodSportOrder(row)).toHaveLength(1);
    expect(readPodSportOrders()[0].orderId).toBe("8821");
    expect(formatPodSportOrderMeta(row, 1_970_000 + 5_000)).toMatch(/自动/);
    expect(parsePodSportOrders([{ id: "x" }, { id: "x", orderId: "1" }])).toHaveLength(1);
    expect(summarizePodSportOrders(1_970_000).count).toBe(1);
    expect(summarizePodSportOrders(1_970_000).todayStake).toBe(50);
    expect(POD_SPORT_ORDERS_KEY).toBe("changmen:podSportOrders");
  });
});
