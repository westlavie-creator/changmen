import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildObSportProcessBetBody,
  pickObSportMarketInfo,
} from "@/runtime/obSportPlaceBet";
import { pickPodFollowAutoTicket, podFollowPlaceBlock, placePodFollowBet } from "@/runtime/podFollowPlace";
import type { PodFollowPlaceTicket } from "@/runtime/podFollowPlace";
import { appendPodSportOrder } from "@/runtime/podSportOrders";

const mem = new Map<string, string>();

vi.mock("@/runtime/obSportPlaceBet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/runtime/obSportPlaceBet")>();
  return {
    ...actual,
    placeObSportSingle: vi.fn(),
  };
});

import { placeObSportSingle } from "@/runtime/obSportPlaceBet";

function ticket(over: Partial<PodFollowPlaceTicket> = {}): PodFollowPlaceTicket {
  return {
    id: "1",
    stake: 50,
    fixtureStatus: "matched",
    obMid: "5652292",
    market: { status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95 },
    quote: { status: "ok", quote: 1.95, minObOdds: 1.9 },
    ...over,
  };
}

beforeEach(() => {
  mem.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => { mem.set(key, String(value)); },
    removeItem: (key: string) => { mem.delete(key); },
  });
  vi.mocked(placeObSportSingle).mockReset();
});

describe("podFollowPlace", () => {
  it("blocks guess tickets that are not OB-ready", () => {
    expect(podFollowPlaceBlock(ticket({ fixtureStatus: "none" }))).toBe("场未对上");
    expect(podFollowPlaceBlock(ticket({ market: { status: "none", ob: true, locked: false, oid: "x", quote: 1.9 } }))).toBe("盘未对上");
    expect(podFollowPlaceBlock(ticket({ market: { status: "matched", ob: false, locked: false, oid: "x", quote: 1.9 } }))).toBe("无 OB 盘");
    expect(podFollowPlaceBlock(ticket({ quote: { status: "short", quote: 1.8, minObOdds: 1.9 } }))).toBe("OB 价不够");
    expect(podFollowPlaceBlock(ticket({ stake: 0 }))).toBe("注码未设");
    expect(podFollowPlaceBlock(ticket())).toBeNull();
  });

  it("auto-picks the first unplaced ready ticket", () => {
    const ready = ticket({ id: "a" });
    const blocked = ticket({ id: "b", stake: 0 });
    const later = ticket({ id: "c" });
    expect(pickPodFollowAutoTicket([blocked, ready, later], [])?.id).toBe("a");
    expect(pickPodFollowAutoTicket([ready, later], ["a"])?.id).toBe("c");
    expect(pickPodFollowAutoTicket([ready], ["a"])).toBeNull();
  });

  it("refuses to place again when a local sport order already exists for the ticket", async () => {
    appendPodSportOrder({
      id: "1",
      orderId: "old-1",
      at: 1,
      home: "A",
      away: "B",
      sideLabel: "大",
      marketLabel: "大小",
      odds: 1.95,
      stake: 50,
      oid: "oid-over",
      obMid: "5652292",
      auto: true,
    });
    const result = await placePodFollowBet(ticket());
    expect(result).toEqual({ ok: false, message: "已下过" });
    expect(placeObSportSingle).not.toHaveBeenCalled();
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
