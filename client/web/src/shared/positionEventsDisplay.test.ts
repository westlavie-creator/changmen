import { describe, expect, it } from "vitest";
import type { OrderRow } from "@/types/order";
import {
  buyPositionEventTagText,
  positionEventObserveTagText,
  sellPositionEventTagText,
} from "@/shared/positionEventsDisplay";

function buy(partial: Partial<OrderRow> = {}): OrderRow {
  return {
    OrderID: "buy-1",
    Type: "Polymarket",
    PmSide: "buy",
    ...partial,
  };
}

function sell(partial: Partial<OrderRow> = {}): OrderRow {
  return {
    OrderID: "sell-1",
    Type: "Polymarket",
    PmSide: "sell",
    PmBuyOrderId: "buy-1",
    ...partial,
  };
}

describe("positionEventsDisplay", () => {
  it("buy shows 仓位 when events exist", () => {
    expect(buyPositionEventTagText(buy())).toBeNull();
    expect(buyPositionEventTagText(buy({
      PositionEvents: { sells: [{ id: "sell-1" }, { id: "sell-2" }] },
    }))).toBe("仓位");
  });

  it("sell shows 已记入 when id is in buy events", () => {
    const peers = [
      buy({ PositionEvents: { sells: [{ id: "sell-1" }] } }),
      sell(),
    ];
    expect(sellPositionEventTagText(sell(), peers)).toBe("已记入");
    // 观察标只挂买单仓位·N；附属来源由 OrderList sellSource 显示
    expect(positionEventObserveTagText(sell(), peers)).toBeNull();
    expect(positionEventObserveTagText(peers[0], peers)).toBe("仓位");
  });

  it("old sell stays silent when buy has no dual-write signal", () => {
    expect(sellPositionEventTagText(sell(), [buy(), sell()])).toBeNull();
  });

  it("sell stays silent when only lastSell is set (pre-phase1 field)", () => {
    const peers = [
      buy({ PmLastSellOrderId: "sell-1" }),
      sell(),
    ];
    expect(sellPositionEventTagText(sell(), peers)).toBeNull();
  });

  it("sell shows 缺事件 when buy has events but this id missing", () => {
    const peers = [
      buy({ PositionEvents: { sells: [{ id: "other-sell" }] } }),
      sell(),
    ];
    expect(sellPositionEventTagText(sell(), peers)).toBe("缺事件");
  });
});
