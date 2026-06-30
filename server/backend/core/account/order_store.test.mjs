import { placeholderLinkFromCreateAt } from "@changmen/db";
import { parseVenueCreateAt } from "@changmen/shared/time/match_time";
import { describe, expect, it, vi } from "vitest";
import { listUserProfitRank, parseOrderBindRow, resolveStoredLink } from "./order_store.js";

vi.mock("@changmen/db", () => ({
  fetchOrdersForProfitAggregate: vi.fn(),
  fetchProfiles: vi.fn(),
  placeholderLinkFromCreateAt: (ca) => ca,
  backendBindLinkFromCreateAt: vi.fn(),
}));

describe("parseVenueCreateAt in saveOrder path", () => {
  it("parses datetime strings that parseNum would drop", () => {
    const ts = parseVenueCreateAt("2026-06-14 15:30:00");
    expect(ts).toBe(Date.parse("2026-06-14T15:30:00"));
  });

  it("reads CreateAt PascalCase shape", () => {
    expect(parseVenueCreateAt(undefined)).toBeGreaterThan(0);
    expect(parseVenueCreateAt(1700000000000)).toBe(1700000000000);
  });
});

describe("resolveStoredLink", () => {
  it("uses create_at placeholder when link is 0", () => {
    const ca = 1_781_882_462_790;
    expect(resolveStoredLink(0, "order-1", ca)).toBe(ca);
    expect(resolveStoredLink(0, "order-1", ca)).toBe(placeholderLinkFromCreateAt(ca));
  });

  it("keeps non-zero stored link", () => {
    expect(resolveStoredLink(1_700_000_000_123, "o", 99)).toBe(1_700_000_000_123);
  });
});

describe("parseOrderBindRow", () => {
  it("reads A8-style nA fields", () => {
    expect(
      parseOrderBindRow({
        LinkID: 1710000000123,
        Provider: "OB",
        OrderID: "venue-99",
      }),
    ).toEqual({
      orderId: "venue-99",
      playerId: 0,
      linkId: 1710000000123,
      provider: "OB",
    });
  });

  it("reads changmen extensions with PlayerID", () => {
    expect(
      parseOrderBindRow({
        LinkID: 42,
        Provider: "RAY",
        OrderID: "r-1",
        PlayerID: 7,
      }),
    ).toEqual({
      orderId: "r-1",
      playerId: 7,
      linkId: 42,
      provider: "RAY",
    });
  });

  it("skips empty orderId or linkId in saveOrderBind loop", () => {
    const row = parseOrderBindRow({ LinkID: 0, OrderID: "x", Provider: "PB" });
    expect(row.linkId).toBe(0);
    expect(row.orderId).toBe("x");
  });
});

describe("listUserProfitRank", () => {
  it("excludes admin users from rank rows", async () => {
    const sb = await import("@changmen/db");
    vi.mocked(sb.fetchProfiles).mockResolvedValue([
      { id: "u1", user_name: "alice", is_admin: false, role: "user" },
      { id: "u2", user_name: "admin", is_admin: true, role: "admin" },
    ]);
    vi.mocked(sb.fetchOrdersForProfitAggregate).mockResolvedValue([
      { user_id: "u1", status: "Win", money: 100, bet_money: 500 },
      { user_id: "u2", status: "Win", money: 999, bet_money: 9000 },
    ]);

    const rows = await listUserProfitRank("2026-06-30");

    expect(rows).toHaveLength(1);
    expect(rows[0].UserName).toBe("alice");
    expect(rows[0].Money).toBe(100);
  });
});
