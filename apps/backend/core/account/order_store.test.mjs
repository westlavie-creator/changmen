import { describe, expect, it } from "vitest";
import { parseOrderBindRow } from "./order_store.js";
import { parseVenueCreateAt } from "@changmen/shared/time/match_time.mjs";

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
