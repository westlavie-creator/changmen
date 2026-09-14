import { describe, expect, it } from "vitest";
import {
  obSportPlaceAccepted,
  orderIdFromObSportPlace,
  parseObSportOrderStatusPush,
} from "@/runtime/obSportOrderStatus";

describe("obSportOrderStatus", () => {
  it("reads orderNo from processBet orderDetailRespList", () => {
    const decoded = {
      data: {
        orderDetailRespList: [{ orderNo: "8821", orderStatusCode: 1 }],
      },
    };
    expect(orderIdFromObSportPlace(decoded)).toBe("8821");
    expect(obSportPlaceAccepted(decoded)).toEqual({ ok: true, orderId: "8821" });
  });

  it("rejects place when orderStatusCode is not 1", () => {
    expect(obSportPlaceAccepted({
      data: { orderDetailRespList: [{ orderNo: "x", orderStatusCode: 2, msg: "拒单" }] },
    })).toEqual({ ok: false, message: "拒单" });
  });

  it("ignores accepted place as settlement", () => {
    expect(parseObSportOrderStatusPush({
      data: { orderDetailRespList: [{ orderNo: "8821", orderStatusCode: 1 }] },
    })).toEqual([]);
  });

  it("maps C201 outcome to Win/Lose and skips C105", () => {
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", outcome: 2, profitAmount: 47.5 },
    })).toEqual([{ orderId: "8821", status: "Win", profit: 47.5 }]);
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", outcome: 3, profitAmount: -50 },
    })).toEqual([{ orderId: "8821", status: "Lose", profit: -50 }]);
    expect(parseObSportOrderStatusPush({
      cmd: "C105",
      cd: { orderNo: "8821", outcome: 2, profitAmount: 1 },
    })).toEqual([]);
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", orderStatusCode: 2 },
    })).toEqual([]);
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", status: "reject" },
    })).toEqual([{ orderId: "8821", status: "Reject", profit: 0 }]);
  });
});
