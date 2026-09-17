import { describe, expect, it } from "vitest";
import type { PodFollowPlaceTicket } from "@/runtime/podFollowPlace";
import {
  formatPodFollowPending,
  resolvePodFollowPending,
} from "@/runtime/podFollowPending";

function ticket(over: Partial<PodFollowPlaceTicket> = {}): PodFollowPlaceTicket {
  return {
    id: "1",
    stake: 50,
    fixtureStatus: "matched",
    fixtureBasis: "confirmed",
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

describe("podFollowPending", () => {
  it("shows placed / placing / failure note first", () => {
    expect(resolvePodFollowPending({
      ticket: ticket(),
      placed: true,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
      placeNote: "ord-1",
    })).toEqual({ placed: true, label: "已下", detail: "ord-1", tone: "ok" });
    expect(resolvePodFollowPending({
      ticket: ticket(),
      placed: false,
      placing: true,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
    }).label).toBe("下单中");
    expect(formatPodFollowPending(resolvePodFollowPending({
      ticket: ticket(),
      placed: false,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
      placeNote: "余额不足",
    }))).toBe("未下 · 余额不足");
  });

  it("explains hand blocks and ready-to-click when auto is off", () => {
    expect(resolvePodFollowPending({
      ticket: ticket({ stake: 0 }),
      placed: false,
      autoPlace: false,
      withinAge: true,
      maxAgeSec: 30,
    }).detail).toBe("注码未设");
    expect(resolvePodFollowPending({
      ticket: ticket(),
      placed: false,
      autoPlace: false,
      withinAge: true,
      maxAgeSec: 30,
    })).toMatchObject({ detail: "可手点", tone: "ready" });
  });

  it("surfaces auto wait / age / attempted reasons", () => {
    expect(resolvePodFollowPending({
      ticket: ticket({ market: {
        status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95,
        marketCode: "totals", boardSide: "over", boardLine: 2.5, fromLive: false,
      } }),
      placed: false,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
    })).toMatchObject({ detail: "等实时价", tone: "wait" });
    expect(resolvePodFollowPending({
      ticket: ticket(),
      placed: false,
      autoPlace: true,
      withinAge: false,
      maxAgeSec: 30,
    }).detail).toBe("降赔已过期(30s)");
    expect(resolvePodFollowPending({
      ticket: ticket(),
      placed: false,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
      autoAttempted: true,
    }).detail).toBe("自动已试过");
    expect(resolvePodFollowPending({
      ticket: ticket(),
      placed: false,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
    })).toMatchObject({ detail: "待自动", tone: "ready" });
    expect(resolvePodFollowPending({
      ticket: null,
      placed: false,
      autoPlace: true,
      withinAge: true,
      maxAgeSec: 30,
    }).detail).toBe("已离线");
  });
});
