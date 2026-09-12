import { describe, expect, it } from "vitest";
import {
  buildObSportProcessBetBody,
  pickObSportMarketInfo,
} from "@/runtime/obSportPlaceBet";
import { podFollowPlaceBlock, type PodFollowPlaceTicket } from "@/runtime/podFollowPlace";

function ticket(over: Partial<PodFollowPlaceTicket> = {}): PodFollowPlaceTicket {
  return {
    id: "1",
    stake: 50,
    fixtureStatus: "matched",
    obMid: "5652292",
    market: { status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95, marketCode: "totals", boardSide: "over", fromLive: true },
    quote: { status: "ok", quote: 1.95, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 5.4 },
    ...over,
  };
}

describe("podFollowPlace", () => {
  it("blocks guess tickets that are not OB-ready", () => {
    expect(podFollowPlaceBlock(ticket({ fixtureStatus: "none" }))).toBe("场未对上");
    expect(podFollowPlaceBlock(ticket({
      market: { status: "none", ob: true, locked: false, oid: "x", quote: 1.9, marketCode: "totals", boardSide: "over", fromLive: true },
    }))).toBe("盘未对上");
    expect(podFollowPlaceBlock(ticket({
      market: { status: "matched", ob: false, locked: false, oid: "x", quote: 1.9, marketCode: "totals", boardSide: "over", fromLive: true },
    }))).toBe("无 OB 盘");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "short", quote: 1.8, minObOdds: 1.9, maxObOdds: 2.18, evPercent: -2 } }))).toBe("OB 价不够");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "spike", quote: 2.4, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 30 } }))).toBe("EV 异常");
    expect(podFollowPlaceBlock(ticket({ stake: 0 }))).toBe("注码未设");
    expect(podFollowPlaceBlock(ticket())).toBeNull();
  });
});

describe("obSportPlaceBet payload", () => {
  it("picks oid/hid/mid from a nested query envelope and builds a single EU order", () => {
    const info = pickObSportMarketInfo({
      data: { hls: [{ ol: [{ oid: "oid-over", hid: "88", hpid: "2", mid: "5652292", ov: 195000, minBet: 10, maxBet: 500 }] }] },
    }, "oid-over");
    expect(info).toMatchObject({ oid: "oid-over", hid: "88", hpid: "2", mid: "5652292", odds: 1.95 });
    const body = buildObSportProcessBetBody({
      oid: info!.oid,
      mid: info!.mid,
      hid: info!.hid,
      hpid: info!.hpid,
      odds: info!.odds,
      stake: 50,
    });
    const detail = (body.seriesOrders as Array<{ orderDetailList: Array<Record<string, unknown>> }>)[0].orderDetailList[0];
    expect(detail.playOptionId).toBe("oid-over");
    expect(detail.betAmount).toBe(50);
    expect(detail.oddsType).toBe(1);
    expect(detail.odds).toBe(1.95);
  });
});
