import { describe, expect, it } from "vitest";
import type { OrderRow } from "@/types/order";
import { isLinkedArbGroup, sortOrderGroupEntries } from "@/stores/orderStore";

/** 与 orderStore.groupByLink 相同逻辑，便于无 Pinia 单测 */
function groupByLink(list: OrderRow[]) {
  const map = new Map<number, OrderRow[]>();
  for (const row of list) {
    const link = Number(row.Link) || Number(row.OrderID) || 0;
    if (!map.has(link)) map.set(link, []);
    map.get(link)!.push(row);
  }
  return map;
}

function linkLegend(rows: OrderRow[]) {
  const LOSE_REJECT = new Set(["Reject", "Return"]);
  const stake = rows
    .filter((r) => !LOSE_REJECT.has(String(r.Status)))
    .reduce((sum, r) => sum + (Number(r.BetMoney) || 0), 0);
  const unsettled = rows
    .filter((r) => r.Status === "None")
    .map((r) => {
      const odds = Number(r.Odds) || 0;
      const bet = Number(r.BetMoney) || 0;
      return Math.floor(bet * odds - stake);
    });
  if (unsettled.length) return unsettled.join(" - ");
  const total = rows.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
  return String(Math.floor(total));
}

describe("orderStore arb link grouping", () => {
  it("groups two legs with the same Link into one fieldset bucket", () => {
    const link = 1710000000999;
    const grouped = groupByLink([
      { OrderID: "a", Link: link, Type: "OB", PlayerID: 1, Status: "None", BetMoney: 100, Odds: 2.1 },
      { OrderID: "b", Link: link, Type: "RAY", PlayerID: 2, Status: "None", BetMoney: 100, Odds: 2.0 },
    ]);
    expect(grouped.size).toBe(1);
    expect(grouped.get(link)?.length).toBe(2);
  });

  it("keeps unbound legs separate when Link differs", () => {
    const grouped = groupByLink([
      { OrderID: "a", Link: 111, Type: "OB" },
      { OrderID: "b", Link: 222, Type: "RAY" },
    ]);
    expect(grouped.size).toBe(2);
  });

  it("legend shows unsettled profit preview joined by dash", () => {
    const text = linkLegend([
      { Status: "None", BetMoney: 100, Odds: 2.0, Money: 0 },
      { Status: "None", BetMoney: 100, Odds: 2.2, Money: 0 },
    ]);
    expect(text).toContain(" - ");
  });
});

describe("orderStore sortOrderGroupEntries", () => {
  it("sorts groups by newest CreateAt first", () => {
    const grouped = groupByLink([
      { OrderID: "old", Link: 100, CreateAt: 1000 },
      { OrderID: "new-a", Link: 200, CreateAt: 3000 },
      { OrderID: "new-b", Link: 200, CreateAt: 3100 },
      { OrderID: "mid", Link: 150, CreateAt: 2000 },
    ]);
    const entries = sortOrderGroupEntries(grouped);
    expect(entries.map(([key]) => key)).toEqual([200, 150, 100]);
  });

  it("sorts legs inside a linked group by CreateAt ascending", () => {
    const link = 999;
    const grouped = groupByLink([
      { OrderID: "b", Link: link, CreateAt: 2000 },
      { OrderID: "a", Link: link, CreateAt: 1000 },
    ]);
    const rows = sortOrderGroupEntries(grouped)[0][1];
    expect(rows.map((r) => r.OrderID)).toEqual(["a", "b"]);
  });
});

describe("isLinkedArbGroup", () => {
  it("detects positive link with multiple legs", () => {
    expect(
      isLinkedArbGroup([
        { Link: 123, OrderID: "a" },
        { Link: 123, OrderID: "b" },
      ]),
    ).toBe(true);
  });

  it("rejects single-leg negative link", () => {
    expect(isLinkedArbGroup([{ Link: -123, OrderID: "a" }])).toBe(false);
  });
});
