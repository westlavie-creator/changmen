import { describe, expect, it } from "vitest";
import {
  isPlaceholderTeam,
  obSportPlaceAccepted,
  oddsFromObSportPlace,
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

  it("hydrates odds/stake/match from official bet-record detailList", () => {
    expect(parseObSportBetRecordList({
      data: {
        records: [{
          orderNo: "ord-x",
          betAmount: 100,
          oddFinally: 2.21,
          profitAmount: 121,
          outcome: 4,
          detailList: [{
            // [官网可证实] PC 注单卡 homeName + " VS " + awayName
            homeName: "中央骏马",
            awayName: "猎手",
            matchName: "蒙古超级联赛",
            playName: "全场大小",
            marketValue: "2.5",
            playOptionName: "大",
            matchInfoId: "5602643",
            playOptionsId: "oid-1",
            oddFinally: 2.21,
          }],
        }],
      },
    })).toEqual([{
      orderId: "ord-x",
      status: "Win",
      profit: 121,
      odds: 2.21,
      stake: 100,
      home: "中央骏马",
      away: "猎手",
      sideLabel: "大",
      marketLabel: "全场大小 2.5",
      oid: "oid-1",
      obMid: "5602643",
    }]);
  });

  it("ignores placeholder league+mid team names from local board", () => {
    expect(isPlaceholderTeam("亚洲运动会2026 - 女子(在日本) 5629080")).toBe(true);
    expect(isPlaceholderTeam("客")).toBe(true);
    expect(isPlaceholderTeam("中央骏马")).toBe(false);
  });

  it("maps C201 outcome to Win/Lose/Return and skips C105", () => {
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", outcome: 4, profitAmount: 47.5 },
    })).toEqual([{ orderId: "8821", status: "Win", profit: 47.5 }]);
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", outcome: 3, profitAmount: -50 },
    })).toEqual([{ orderId: "8821", status: "Lose", profit: -50 }]);
    expect(parseObSportOrderStatusPush({
      cmd: "C201",
      cd: { orderNo: "8821", outcome: 2, profitAmount: 0 },
    })).toEqual([{ orderId: "8821", status: "Return", profit: 0 }]);
    expect(parseObSportOrderStatusPush({
      cmd: "C105",
      cd: { orderNo: "8821", outcome: 4, profitAmount: 1 },
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

  it("maps settled list rows by backAmount / official outcome codes", () => {
    expect(parseObSportBetRecordList({
      data: { list: [{ orderNo: "a", backAmount: -100, outcome: 3 }] },
    })).toEqual([{ orderId: "a", status: "Lose", profit: -100 }]);
    expect(parseObSportBetRecordList({
      data: { records: [{ orderNo: "b", outcome: 4, profitAmount: 40 }] },
    })).toEqual([{ orderId: "b", status: "Win", profit: 40 }]);
    expect(parseObSportBetRecordList({
      data: { records: [{ orderNo: "c", outcome: 2, profitAmount: 0 }] },
    })).toEqual([{ orderId: "c", status: "Return", profit: 0 }]);
    expect(parseObSportBetRecordList({
      data: { records: [{ orderNo: "d", outcome: 5, profitAmount: 20 }] },
    })).toEqual([{ orderId: "d", status: "Win", profit: 20 }]);
  });

  it("reads oddsValues from betPB when odds changed", () => {
    expect(oddsFromObSportPlace({
      data: {
        orderDetailRespList: [{ orderNo: "8821", orderStatusCode: 1, oddsValues: 2.21, oddsChange: true }],
      },
    })).toBe(2.21);
  });
});
