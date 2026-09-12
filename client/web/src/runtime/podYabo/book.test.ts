import { describe, expect, it } from "vitest";
import { listPodBookNeighbors, lookupPodBookNvp } from "@/runtime/podYabo/book";
import type { PodBookLine } from "@/runtime/podAlerts";

const books: PodBookLine[] = [
  { eventId: "e", period: 0, market: "totals", line: 2.5, nvpHome: 0, nvpAway: 0, nvpOver: 1.85, nvpUnder: 1.98 },
  { eventId: "e", period: 0, market: "totals", line: 2.25, nvpHome: 0, nvpAway: 0, nvpOver: 1.9, nvpUnder: 1.93 },
  { eventId: "e", period: 0, market: "spreads", line: -0.5, nvpHome: 1.91, nvpAway: 1.92, nvpOver: 0, nvpUnder: 0 },
  { eventId: "e", period: 0, market: "spreads", line: -0.25, nvpHome: 1.87, nvpAway: 1.96, nvpOver: 0, nvpUnder: 0 },
];

describe("podYabo/book", () => {
  it("looks up the same line's NVP, not a neighbor", () => {
    expect(lookupPodBookNvp(books, {
      eventId: "e", period: 0, market: "totals", side: "over", line: 2.5,
    })).toBe(1.85);
    expect(lookupPodBookNvp(books, {
      eventId: "e", period: 0, market: "spreads", side: "away", line: 0.5,
    })).toBe(1.92);
    expect(lookupPodBookNvp(books, {
      eventId: "missing", period: 0, market: "totals", side: "over", line: 2.5,
    })).toBe(0);
  });

  it("lists quarter neighbors only", () => {
    expect(listPodBookNeighbors(books, {
      eventId: "e", period: 0, market: "totals", side: "over", line: 2.5,
    })).toEqual([{ line: 2.25, nvp: 1.9 }]);
    expect(listPodBookNeighbors(books, {
      eventId: "e", period: 0, market: "spreads", side: "home", line: -0.5,
    })).toEqual([{ line: -0.25, nvp: 1.87 }]);
  });
});
