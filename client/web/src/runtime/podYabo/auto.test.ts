import { describe, expect, it } from "vitest";
import type { PodFollowPlaceTicket } from "@/runtime/podFollowPlace";
import { pickPodYaboAutoTicket, podYaboAutoSkipReason } from "@/runtime/podYabo/auto";

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

describe("podYabo/auto", () => {
  it("picks the highest EV ticket; skips blocked / guess / same-side", () => {
    const ready = ticket({ id: "a" });
    const blocked = ticket({ id: "b", stake: 0 });
    const later = ticket({ id: "c" });
    expect(pickPodYaboAutoTicket([blocked, ready, later], [])?.id).toBe("a");
    expect(pickPodYaboAutoTicket([ready, later], ["a"])?.id).toBe("c");
    const low = ticket({ id: "low", quote: { status: "ok", quote: 1.92, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 3 } });
    const high = ticket({ id: "high", quote: { status: "ok", quote: 2.05, minObOdds: 1.9, maxObOdds: 2.18, evPercent: 11 } });
    expect(pickPodYaboAutoTicket([low, high], [])?.id).toBe("high");
    expect(pickPodYaboAutoTicket([high], [], [{
      obMid: "5652292",
      marketCode: "totals",
      boardSide: "over",
    }])).toBeNull();
    // 对齐 AutoYabo：自动等馆内实时价；HTTP 快照不进自动
    expect(pickPodYaboAutoTicket([ticket({ id: "http", market: {
      status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95, marketCode: "totals", boardSide: "over", boardLine: 2.5, fromLive: false,
    } })], [])).toBeNull();
    expect(podYaboAutoSkipReason(ticket({ id: "http", market: {
      status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95, marketCode: "totals", boardSide: "over", boardLine: 2.5, fromLive: false,
    } }))).toBe("等实时价");
    expect(pickPodYaboAutoTicket([ticket({ id: "guess", fixtureBasis: "guess" })], [])).toBeNull();
    expect(pickPodYaboAutoTicket([ticket({ id: "cap" })], [], [], {
      todayProfit: -200,
      openStake: 0,
      maxDailyLoss: 200,
    })).toBeNull();
  });
});
