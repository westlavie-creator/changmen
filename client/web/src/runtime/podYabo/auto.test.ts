import { describe, expect, it } from "vitest";
import type { PodFollowPlaceTicket } from "@/runtime/podFollowPlace";
import { pickPodYaboAutoTicket } from "@/runtime/podYabo/auto";

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

describe("podYabo/auto", () => {
  it("picks the highest EV live ticket and skips HTTP / same-side add", () => {
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
    expect(pickPodYaboAutoTicket([ticket({ id: "http", market: {
      status: "matched", ob: true, locked: false, oid: "oid-over", quote: 1.95, marketCode: "totals", boardSide: "over", fromLive: false,
    } })], [])).toBeNull();
  });
});
