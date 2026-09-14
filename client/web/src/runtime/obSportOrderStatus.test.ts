import { describe, expect, it } from "vitest";
import {
  obSportPlaceAccepted,
  orderIdFromObSportPlace,
  parseObSportBetRecordList,
  parseObSportOrderStatusPush,
  parseObSportQueryOrderStatus,
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
      cd: { orderNo: "8821", status: 2 },
    })).toEqual([{ orderId: "8821", status: "Reject", profit: 0 }]);
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", status: "reject" },
    })).toEqual([{ orderId: "8821", status: "Reject", profit: 0 }]);
  });

  it("rejects place without venue orderNo", () => {
    expect(obSportPlaceAccepted({
      data: { orderDetailRespList: [{ orderStatusCode: 1 }] },
    })).toEqual({ ok: false, message: "场馆未返回单号" });
  });

  it("maps queryOrderStatus 2/4 to Reject and ignores 0/1", () => {
    expect(parseObSportQueryOrderStatus({
      code: 200,
      data: [
        { orderNo: "a", status: 1 },
        { orderNo: "b", status: 2 },
        { orderNo: "c", status: 4 },
      ],
    })).toEqual([
      { orderId: "b", status: "Reject", profit: 0 },
      { orderId: "c", status: "Reject", profit: 0 },
    ]);
  });

  it("maps bet-record profitAmount without treating status 2 as win", () => {
    expect(parseObSportBetRecordList({
      data: { records: [{ orderNo: "8821", profitAmount: 47.5 }] },
    })).toEqual([{ orderId: "8821", status: "Win", profit: 47.5 }]);
    expect(parseObSportQueryOrderStatus({
      data: [{ orderNo: "8821", status: 2 }],
    })).toEqual([{ orderId: "8821", status: "Reject", profit: 0 }]);
  });
});
