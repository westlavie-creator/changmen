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

describe("mergeOrderLogicalSave buy stake after manual sell", () => {
  it("keeps original betMoney and accumulates money when closing a buy", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const prevRaw = {
      pmOrigin: "changmen",
      pmSide: "buy",
      betMoney: 111.52,
      pmStakeUsdc: 16.4,
      pmShares: 48.2353,
      pmAttributedSellShares: 0,
      money: 0,
      status: "none",
    };
    const incoming = {
      provider: "Polymarket",
      pmOrigin: "changmen",
      pmSide: "buy",
      betMoney: 111.52,
      pmStakeUsdc: 0,
      pmSellState: "closed",
      pmAttributedSellShares: 48.2353,
      money: 3,
      status: "none",
    };
    const { raw, bet_money, money } = mergeOrderLogicalSave(
      { bet_money: 111.52, money: 0 },
      prevRaw,
      incoming,
      "changmen",
    );
    expect(bet_money).toBe(111.52);
    expect(raw.betMoney).toBe(111.52);
    expect(raw.pmSellState).toBe("closed");
    expect(raw.pmStakeUsdc).toBe(0);
    expect(money).toBe(3);
  });

  it("stores and preserves pmSellProceeds on buy (PF-aligned)", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const first = mergeOrderLogicalSave(
      { bet_money: 100, money: 0 },
      {
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmStakeUsdc: 10,
        pmShares: 20,
        money: 0,
        status: "none",
      },
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmStakeUsdc: 0,
        pmSellState: "closed",
        pmAttributedSellShares: 20,
        pmSellProceeds: 11.5,
        pmLastSellOrderId: "0xsell",
        money: 10,
        status: "none",
      },
      "changmen",
    );
    expect(first.raw.pmSellProceeds).toBe(11.5);
    expect(first.raw.pmLastSellOrderId).toBe("0xsell");

    // sync ?????????
    const wiped = mergeOrderLogicalSave(
      { bet_money: 100, money: 10 },
      first.raw,
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmSellState: "closed",
        pmAttributedSellShares: 20,
        money: 0,
        status: "none",
      },
      "changmen",
    );
    expect(wiped.raw.pmSellProceeds).toBe(11.5);
    expect(wiped.raw.pmLastSellOrderId).toBe("0xsell");
    expect(wiped.money).toBe(10);
  });

  it("preserves positionEvents.sells when sync omits them; upserts by id", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const first = mergeOrderLogicalSave(
      { bet_money: 100, money: 0 },
      { pmSide: "buy", pmOrigin: "changmen" },
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmSellState: "partial",
        pmAttributedSellShares: 5,
        pmSellProceeds: 3,
        pmLastSellOrderId: "0xs1",
        money: 1,
        positionEvents: {
          sells: [{ id: "0xs1", at: 10, shares: 5, proceeds: 3, origin: "changmen" }],
        },
      },
      "changmen",
    );
    expect(first.raw.positionEvents.sells).toHaveLength(1);

    const syncWipe = mergeOrderLogicalSave(
      { bet_money: 100, money: 1 },
      first.raw,
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmSellState: "partial",
        pmAttributedSellShares: 5,
        money: 0,
      },
      "changmen",
    );
    expect(syncWipe.raw.positionEvents.sells).toHaveLength(1);
    expect(syncWipe.raw.positionEvents.sells[0].id).toBe("0xs1");

    const second = mergeOrderLogicalSave(
      { bet_money: 100, money: 1 },
      syncWipe.raw,
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmSellState: "closed",
        pmAttributedSellShares: 10,
        pmSellProceeds: 7,
        pmLastSellOrderId: "0xs2",
        money: 2,
        positionEvents: {
          sells: [{ id: "0xs2", at: 20, shares: 5, proceeds: 4, origin: "changmen" }],
        },
      },
      "changmen",
    );
    expect(second.raw.positionEvents.sells.map(s => s.id)).toEqual(["0xs1", "0xs2"]);

    const retrySame = mergeOrderLogicalSave(
      { bet_money: 100, money: 2 },
      second.raw,
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        positionEvents: {
          sells: [{ id: "0XS2", at: 20, shares: 5, proceeds: 4.1, origin: "changmen" }],
        },
      },
      "changmen",
    );
    expect(retrySame.raw.positionEvents.sells).toHaveLength(2);
    expect(retrySame.raw.positionEvents.sells.find(s => s.id.toLowerCase() === "0xs2").proceeds)
      .toBe(4.1);
  });

  it("PF buy keeps positionEvents even if stray pmSide=sell is present", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const prev = {
      pfSide: "buy",
      positionEvents: {
        sells: [{ id: "0xpf1", at: 1, shares: 1, proceeds: 2, origin: "changmen" }],
      },
    };
    const { raw } = mergeOrderLogicalSave(
      { bet_money: 10, money: 1 },
      prev,
      {
        provider: "PredictFun",
        pfSide: "buy",
        // ??????? pmSide ???????????
        pmSide: "sell",
        betMoney: 10,
        money: 1,
      },
    );
    expect(raw.positionEvents.sells).toHaveLength(1);
    expect(raw.positionEvents.sells[0].id).toBe("0xpf1");
  });

  it("does not invent pmSellProceeds=0 on legacy closed sync", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { raw } = mergeOrderLogicalSave(
      { bet_money: 100, money: 10 },
      {
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmSellState: "closed",
        pmAttributedSellShares: 20,
        money: 10,
        status: "none",
      },
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 100,
        pmSellState: "closed",
        pmAttributedSellShares: 20,
        money: 0,
        status: "none",
      },
      "changmen",
    );
    expect(raw.pmSellProceeds).toBeUndefined();
    expect(raw.money).toBe(10);
  });

  it("keeps original betMoney on first partial sell patch", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const prevRaw = {
      pmOrigin: "changmen",
      pmSide: "buy",
      betMoney: 112,
      pmStakeUsdc: 16.4,
      pmShares: 48.23,
      money: 0,
      status: "none",
    };
    const incoming = {
      provider: "Polymarket",
      pmOrigin: "changmen",
      pmSide: "buy",
      betMoney: 112,
      pmStakeUsdc: 5.9,
      pmSellState: "partial",
      pmAttributedSellShares: 30,
      money: 8,
      status: "none",
    };
    const { raw, bet_money, money } = mergeOrderLogicalSave(
      { bet_money: 112, money: 0 },
      prevRaw,
      incoming,
      "changmen",
    );
    expect(bet_money).toBe(112);
    expect(raw.betMoney).toBe(112);
    expect(raw.pmStakeUsdc).toBe(5.9);
    expect(raw.pmSellState).toBe("partial");
    expect(money).toBe(8);
  });

  it("preserves legacy sell money when sync sends money=0", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const prevRaw = {
      pmOrigin: "changmen",
      pmSide: "sell",
      betMoney: 115,
      money: 3,
      pmBuyOrderId: "0xbuy",
    };
    const incoming = {
      provider: "Polymarket",
      pmOrigin: "changmen",
      pmSide: "sell",
      betMoney: 115,
      money: 0,
      pmBuyOrderId: "0xbuy",
    };
    const { money, raw } = mergeOrderLogicalSave(
      { bet_money: 115, money: 3 },
      prevRaw,
      incoming,
      "changmen",
    );
    expect(money).toBe(3);
    expect(raw.money).toBe(3);
  });
});

describe("mergeOrderLogicalSave PredictFun partial sync", () => {
  it("keeps pfSellState/pfSide/pfBuyOrderId when incoming omits them", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { raw, money, bet_money } = mergeOrderLogicalSave(
      { bet_money: 80, money: 9 },
      {
        pfSide: "buy",
        pfSellState: "closing",
        pfBuyOrderId: "parent-should-not-apply",
        pfTokenId: "tok",
        pfMarketId: "mkt",
        money: 9,
        betMoney: 80,
      },
      {
        provider: "PredictFun",
        pfFeeRateBps: 50,
        money: 0,
        betMoney: 0,
      },
      undefined,
    );
    expect(raw.pfSide).toBe("buy");
    expect(raw.pfSellState).toBe("closing");
    expect(raw.pfTokenId).toBe("tok");
    expect(raw.pfMarketId).toBe("mkt");
    expect(money).toBe(9);
    expect(bet_money).toBe(80);
  });

  it("preserves PF sell money when sync sends money=0", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { money, bet_money, raw } = mergeOrderLogicalSave(
      { bet_money: 40, money: 2 },
      {
        pfSide: "sell",
        pfBuyOrderId: "0xpfbuy",
        money: 2,
        betMoney: 40,
      },
      {
        provider: "PredictFun",
        pfSide: "sell",
        pfBuyOrderId: "0xpfbuy",
        money: 0,
        betMoney: 0,
      },
      undefined,
    );
    expect(money).toBe(2);
    expect(raw.money).toBe(2);
    expect(bet_money).toBe(40);
  });
});

describe("mergeOrderLogicalSave parallel branches (characterization)", () => {
  it("OB venue still preserves stray pfFee* from prev (historical non-PM tail)", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { raw, money, bet_money } = mergeOrderLogicalSave(
      { bet_money: 10, money: 0 },
      {
        pfFeeAmountWei: "1000",
        pfFeeType: "SHARES",
        pfFeeUsdt: 0.1,
        pfFeeRateBps: 50,
      },
      {
        provider: "OB",
        status: "Pending",
        betMoney: 10,
        money: 0,
      },
      undefined,
    );
    expect(raw.pfFeeAmountWei).toBe("1000");
    expect(raw.pfFeeType).toBe("SHARES");
    expect(raw.pfFeeRateBps).toBe(50);
    expect(money).toBe(0);
    expect(bet_money).toBe(10);
    // ???? PF ????????? pfSide
    expect(raw.pfSide).toBeUndefined();
  });

  it("OB does not apply PF money empty-write guard", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { money, bet_money } = mergeOrderLogicalSave(
      { bet_money: 80, money: 12 },
      { money: 12, betMoney: 80 },
      {
        provider: "OB",
        money: 0,
        betMoney: 0,
      },
      undefined,
    );
    // ???????? PF ??? money/bet
    expect(money).toBe(0);
    expect(bet_money).toBe(0);
  });

  it("PM buy preserves max fill shares and fillPrice", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { raw, bet_money, money } = mergeOrderLogicalSave(
      { bet_money: 50, money: 0 },
      {
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 50,
        pmShares: 20,
        pmFillPrice: 0.42,
        money: 0,
        status: "none",
      },
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "buy",
        betMoney: 50,
        pmShares: 0,
        pmFillPrice: 0,
        money: 0,
        status: "none",
      },
      "changmen",
    );
    expect(raw).toMatchObject({
      pmSide: "buy",
      pmShares: 20,
      pmFillPrice: 0.42,
      betMoney: 50,
    });
    expect(bet_money).toBe(50);
    expect(money).toBe(0);
  });

  it("PM changmen sell keeps buy id and non-zero money from prev when sync sends 0", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { raw, bet_money, money } = mergeOrderLogicalSave(
      { bet_money: 12, money: 3.5 },
      {
        pmOrigin: "changmen",
        pmSide: "sell",
        pmBuyOrderId: "0xBuyParent",
        betMoney: 12,
        money: 3.5,
        status: "none",
      },
      {
        provider: "Polymarket",
        pmOrigin: "changmen",
        pmSide: "sell",
        betMoney: 0,
        money: 0,
        status: "none",
      },
      "changmen",
    );
    expect(raw).toMatchObject({
      pmSide: "sell",
      pmOrigin: "changmen",
      pmBuyOrderId: "0xBuyParent",
    });
    expect(money).toBe(3.5);
    expect(bet_money).toBe(12);
  });

  it("PF keeps identity fields on partial sync (characterization)", async () => {
    const { mergeOrderLogicalSave } = await import("./order_store.js");
    const { raw, money, bet_money } = mergeOrderLogicalSave(
      { bet_money: 40, money: 2 },
      {
        pfSide: "buy",
        pfSellState: "open",
        pfBuyOrderId: "",
        pfTokenId: "tok-1",
        pfMarketId: "mkt-9",
        pfOrderHash: "0xhash",
        pfApiOrderId: "api-1",
        money: 2,
        betMoney: 40,
      },
      {
        provider: "PredictFun",
        status: "Pending",
        money: 0,
        betMoney: 0,
      },
      undefined,
    );
    expect(raw).toMatchObject({
      pfSide: "buy",
      pfSellState: "open",
      pfTokenId: "tok-1",
      pfMarketId: "mkt-9",
      pfOrderHash: "0xhash",
      pfApiOrderId: "api-1",
      money: 2,
      betMoney: 40,
    });
    expect(money).toBe(2);
    expect(bet_money).toBe(40);
  });
});
