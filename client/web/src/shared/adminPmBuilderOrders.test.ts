import { describe, expect, it } from "vitest";
import type { PolymarketChangmenOrderRow } from "@/api/admin";
import {
  cmBuilderSideLabel,
  groupChangmenPmOrdersForDisplay,
} from "./adminPmBuilderOrders";

function row(patch: Partial<PolymarketChangmenOrderRow>): PolymarketChangmenOrderRow {
  return {
    orderId: "o1",
    userId: "u1",
    userName: "GB12",
    playerId: 1,
    playerName: "p",
    status: "None",
    betMoney: 10,
    profit: 0,
    odds: 2,
    price: 0.5,
    game: "cs2",
    pmSide: "buy",
    pmShares: 10,
    pmStakeUsdc: 5,
    pmSellState: "",
    pmAttributedSellShares: 0,
    pmMatchResult: "",
    matchTitle: "A vs B",
    betTitle: "胜负",
    item: "A",
    createAt: 1000,
    updateAt: 1000,
    ...patch,
  };
}

describe("groupChangmenPmOrdersForDisplay", () => {
  it("merges sell under buy via pmBuyOrderId", () => {
    const grouped = groupChangmenPmOrdersForDisplay([
      row({
        orderId: "0xbuy",
        pmSide: "buy",
        pmSellState: "closed",
        createAt: 2000,
        profit: 3,
      }),
      row({
        orderId: "0xsell",
        pmSide: "sell",
        pmBuyOrderId: "0xbuy",
        createAt: 2500,
        betMoney: 8,
        profit: 0,
      }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.kind).toBe("buy");
    expect(grouped[0]!.primary.orderId).toBe("0xbuy");
    expect(grouped[0]!.sells.map(s => s.orderId)).toEqual(["0xsell"]);
    expect(cmBuilderSideLabel(grouped[0]!)).toBe("BUY·已卖出");
  });

  it("links sell via buy.pmLastSellOrderId when pmBuyOrderId missing", () => {
    const grouped = groupChangmenPmOrdersForDisplay([
      row({
        orderId: "0xbuy",
        pmSide: "buy",
        pmLastSellOrderId: "0xsell",
        pmSellState: "closed",
        createAt: 2000,
      }),
      row({
        orderId: "0xsell",
        pmSide: "sell",
        createAt: 2500,
      }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.sells[0]!.orderId).toBe("0xsell");
  });

  it("keeps orphan sell as top-level row", () => {
    const grouped = groupChangmenPmOrdersForDisplay([
      row({ orderId: "0xbuy", pmSide: "buy", createAt: 2000 }),
      row({
        orderId: "0xsell-orphan",
        pmSide: "sell",
        pmBuyOrderId: "0xmissing",
        createAt: 3000,
      }),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]!.primary.orderId).toBe("0xsell-orphan");
    expect(grouped[0]!.kind).toBe("orphan-sell");
    expect(cmBuilderSideLabel(grouped[0]!)).toBe("SELL");
    expect(grouped[1]!.primary.orderId).toBe("0xbuy");
    expect(grouped[1]!.sells).toEqual([]);
  });
});
