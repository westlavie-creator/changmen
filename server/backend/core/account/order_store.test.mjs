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

describe("mergePolymarketLogicalSave buy stake after manual sell", () => {
  it("keeps original betMoney and accumulates money when closing a buy", async () => {
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
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
    const { raw, bet_money, money } = mergePolymarketLogicalSave(
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
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
    const first = mergePolymarketLogicalSave(
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

    // sync 不带回款字段时保留
    const wiped = mergePolymarketLogicalSave(
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

  it("does not invent pmSellProceeds=0 on legacy closed sync", async () => {
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
    const { raw } = mergePolymarketLogicalSave(
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
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
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
    const { raw, bet_money, money } = mergePolymarketLogicalSave(
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
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
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
    const { money, raw } = mergePolymarketLogicalSave(
      { bet_money: 115, money: 3 },
      prevRaw,
      incoming,
      "changmen",
    );
    expect(money).toBe(3);
    expect(raw.money).toBe(3);
  });
});

describe("mergePolymarketLogicalSave PredictFun partial sync", () => {
  it("keeps pfSellState/pfSide/pfBuyOrderId when incoming omits them", async () => {
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
    const { raw, money, bet_money } = mergePolymarketLogicalSave(
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
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
    const { money, bet_money, raw } = mergePolymarketLogicalSave(
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

describe("mergePolymarketLogicalSave parallel branches (characterization)", () => {
  it("OB venue still preserves stray pfFee* from prev (historical non-PM tail)", async () => {
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
    const { raw, money, bet_money } = mergePolymarketLogicalSave(
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
    // 场馆不走 PF 身份保护：不应发明 pfSide
    expect(raw.pfSide).toBeUndefined();
  });

  it("OB does not apply PF money empty-write guard", async () => {
    const { mergePolymarketLogicalSave } = await import("./order_store.js");
    const { money, bet_money } = mergePolymarketLogicalSave(
      { bet_money: 80, money: 12 },
      { money: 12, betMoney: 80 },
      {
        provider: "OB",
        money: 0,
        betMoney: 0,
      },
      undefined,
    );
    // 与拆分前一致：非 PF 不保护 money/bet
    expect(money).toBe(0);
    expect(bet_money).toBe(0);
  });
});
