import { describe, expect, it } from "vitest";
import {
  asObSportJsonId,
  buildObSportProcessBetBody,
  buildObSportQueryBetAmountBody,
  findObSportOidMetaInDetail,
  obSportPlayIdFromMarketCode,
  obSportPlayOptions,
  pickObSportMarketInfo,
} from "@/runtime/obSportPlaceBet";
import { podFollowPlaceBlock, type PodFollowPlaceTicket } from "@/runtime/podFollowPlace";

function ticket(over: Partial<PodFollowPlaceTicket> = {}): PodFollowPlaceTicket {
  return {
    id: "1",
    stake: 50,
    fixtureStatus: "matched",
    obMid: "5652292",
    market: {
      status: "matched",
      ob: true,
      locked: false,
      oid: "oid-over",
      quote: 1.95,
      marketCode: "totals",
      boardSide: "over",
      boardLine: 2.5,
      fromLive: true,
    },
    quote: { status: "ok", quote: 1.95, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 5.4 },
    ...over,
  };
}

describe("podFollowPlace", () => {
  it("blocks guess tickets that are not OB-ready", () => {
    expect(podFollowPlaceBlock(ticket({ fixtureStatus: "none" }))).toBe("场未对上");
    expect(podFollowPlaceBlock(ticket({
      market: { status: "none", ob: true, locked: false, oid: "x", quote: 1.9, marketCode: "totals", boardSide: "over", boardLine: 2.5, fromLive: true },
    }))).toBe("盘未对上");
    expect(podFollowPlaceBlock(ticket({
      market: { status: "matched", ob: false, locked: false, oid: "x", quote: 1.9, marketCode: "totals", boardSide: "over", boardLine: 2.5, fromLive: true },
    }))).toBe("无 OB 盘");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "short", quote: 1.8, minObOdds: 1.9, maxObOdds: 2.18, evPercent: -2 } }))).toBe("OB 价不够");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "spike", quote: 2.4, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 30 } }))).toBe("EV 异常");
    expect(podFollowPlaceBlock(ticket({ stake: 0 }))).toBe("注码未设");
    expect(podFollowPlaceBlock(ticket())).toBeNull();
  });
});

describe("obSportPlaceBet payload", () => {
  it("maps board side / marketCode for official query body", () => {
    expect(obSportPlayOptions("over")).toBe("Over");
    expect(obSportPlayOptions("under")).toBe("Under");
    expect(obSportPlayIdFromMarketCode("totals")).toBe("2");
    expect(obSportPlayIdFromMarketCode("ht_totals")).toBe("18");
    const query = buildObSportQueryBetAmountBody({
      oid: "oid-over",
      mid: "5652292",
      odds: 1.95,
      hpid: "2",
      playOptions: "Over",
    });
    expect(query.type).toBe("selection_now");
    const item = (query.orderMaxBetMoney as Array<Record<string, unknown>>)[0];
    expect(item.playOptionId).toBe("oid-over");
    expect(item.matchId).toBe(5652292);
    expect(item.playOptions).toBe("Over");
  });

  it("picks oid/hid/mid from queryBetAmountPB envelope and builds betPB single", () => {
    const info = pickObSportMarketInfo({
      betAmountInfo: [{
        code: 0,
        minBet: "10",
        playId: "2",
        playOptionsId: "148154554843424655",
      }],
      latestMarketInfo: [{
        matchInfoId: "5652292",
        playId: 2,
        matchType: 1,
        currentMarket: {
          id: "146443002396306354",
          chpid: "2",
          placeNum: 1,
          marketValue: "2.5",
          marketOddsList: [
            { id: "oid-under", oddsType: "Under", oddsValue: 188000 },
            { id: "148154554843424655", oddsType: "Over", oddsValue: 195000 },
          ],
        },
        marketList: [{
          id: "146054532003114927",
          chpid: "2",
          placeNum: 1,
          marketValue: "2.75",
          marketOddsList: [{
            id: "other-line",
            oddsType: "Over",
            oddsValue: 200000,
          }],
        }],
      }],
    }, "148154554843424655", { playOptions: "Over", marketValue: "2.5" });
    expect(info).toMatchObject({
      oid: "148154554843424655",
      hid: "146443002396306354",
      hpid: "2",
      mid: "5652292",
      odds: 1.95,
      playOptions: "Over",
      marketValue: "2.5",
      minStake: 10,
    });
    // 不得误取邻档 / Under
    expect(info!.hid).not.toBe("146054532003114927");
    expect(info!.odds).not.toBe(1.88);
    const body = buildObSportProcessBetBody({
      oid: info!.oid,
      mid: info!.mid,
      hid: info!.hid,
      hpid: info!.hpid,
      odds: info!.odds,
      stake: 50,
      playOptions: info!.playOptions,
      marketValue: info!.marketValue,
      placeNum: info!.placeNum,
      oddsValue: info!.oddsValue,
    });
    expect(body.openMiltSingle).toBe(0);
    expect(body.acceptOdds).toBe(2);
    expect(body.currencyCode).toBe("CNY");
    const detail = (body.seriesOrders as Array<{ orderDetailList: Array<Record<string, unknown>> }>)[0].orderDetailList[0];
    expect(detail.playOptionsId).toBe("148154554843424655");
    expect(detail.playOptionId).toBeUndefined();
    // 18 位 hid 必须保持字符串，不能 Number 丢精度
    expect(detail.marketId).toBe("146443002396306354");
    expect(detail.marketId).not.toBe(Number("146443002396306354"));
    expect(detail.matchId).toBe(5652292);
    expect(detail.betAmount).toBe(50);
    expect(detail.oddFinally).toBe(1.95);
    expect(detail.odds).toBe(195000);
    expect(detail.playOptions).toBe("Over");
    expect(detail.marketTypeFinally).toBe("EU");
    expect(detail.marketType).toBeUndefined();
    expect(detail.oddsFinally).toBeUndefined();
  });

  it("keeps 18-digit market ids as strings (Number loses precision)", () => {
    const hid = "146443002396306354";
    expect(String(Number(hid))).not.toBe(hid);
    expect(asObSportJsonId(hid)).toBe(hid);
    expect(asObSportJsonId("5652292")).toBe(5652292);
  });

  it("reads marketId from betAmountInfo when latestMarketInfo is empty", () => {
    const info = pickObSportMarketInfo({
      betAmountInfo: [{
        code: 0,
        minBet: "10",
        playId: "2",
        playOptionsId: "oid-over",
        marketId: "991122",
      }],
      latestMarketInfo: [],
    }, "oid-over");
    expect(info).toMatchObject({
      oid: "oid-over",
      hid: "991122",
      hpid: "2",
      minStake: 10,
    });
  });

  it("finds hid/hpid from match detail by oid", () => {
    const meta = findObSportOidMetaInDetail({
      mid: "5652292",
      hps: [{
        hpid: "2",
        hpn: "全场大小",
        hl: {
          hid: "hid-88",
          hv: "2.5",
          ol: [
            { oid: "oid-under", ot: "Under", ov: 188000 },
            { oid: "oid-over", ot: "Over", ov: 195000 },
          ],
        },
      }],
    }, "oid-over");
    expect(meta).toMatchObject({
      oid: "oid-over",
      hid: "hid-88",
      hpid: "2",
      odds: 1.95,
      marketValue: "2.5",
      playOptions: "Over",
    });
  });

  it("still reads nested oid fixtures used by older tests", () => {
    const info = pickObSportMarketInfo({
      data: { hls: [{ ol: [{ oid: "oid-over", hid: "88", hpid: "2", mid: "5652292", ov: 195000, minBet: 10, maxBet: 500 }] }] },
    }, "oid-over");
    expect(info).toMatchObject({ oid: "oid-over", hid: "88", hpid: "2", mid: "5652292", odds: 1.95 });
  });
});
