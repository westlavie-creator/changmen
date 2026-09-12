import { describe, expect, it } from "vitest";
import {
  formatPodAgo,
  formatPodDropPct,
  formatPodOutcome,
  formatPodPeriod,
  formatPodPrice,
  isFreshPodAlert,
  parsePodAlertsSnapshot,
  parsePodDropAlert,
} from "@/runtime/podAlerts";

describe("podAlerts", () => {
  it("parses a dropping-odds row", () => {
    const alert = parsePodDropAlert({
      id: "1",
      eventId: "99",
      sport: "Football",
      sportId: 1,
      league: "Lithuania - 1 Lyga",
      home: "Neptunas Klaipeda",
      away: "Jonava",
      starts: 1,
      alertedAt: 2,
      market: "Totals",
      lineType: "total",
      period: 0,
      outcome: "over",
      points: 3,
      previous: 2.33,
      current: 1.952,
      nvp: 2.17,
      dropPct: 16.22,
      ways: null,
    });
    expect(alert?.home).toBe("Neptunas Klaipeda");
    expect(formatPodOutcome(alert!)).toBe("大 3");
    expect(formatPodPeriod(alert!.period)).toBe("全场");
    expect(formatPodDropPct(alert!.dropPct)).toBe("16.2%");
    expect(formatPodPrice(alert!.nvp)).toBe("2.17");
  });

  it("formats spread home/away and snapshot wrapper", () => {
    expect(formatPodOutcome({
      outcome: "home",
      points: 0.25,
      home: "FC Van",
      away: "BKMA",
      lineType: "spread",
    })).toBe("FC Van +0.25");
    expect(formatPodOutcome({
      outcome: "under",
      points: 1.75,
      home: "A",
      away: "B",
      lineType: "total",
    })).toBe("小 1.75");
    expect(formatPodPeriod(1)).toBe("半场");
    const snap = parsePodAlertsSnapshot({
      type: "podAlertsSnapshot",
      alerts: [{ id: "a", home: "H", away: "A", outcome: "over", points: 2, dropPct: 8 }],
      capturedAt: 9,
      href: "https://www.pinnacleoddsdropper.com/terminal",
      gridFound: true,
      sourceConnected: true,
    });
    expect(snap.alerts).toHaveLength(1);
    expect(snap.sourceConnected).toBe(true);
    expect(snap.books).toEqual([]);
    const withBook = parsePodAlertsSnapshot({
      alerts: [],
      books: [{ eventId: "99", period: 0, market: "totals", line: 2.5, nvpOver: 1.9, nvpUnder: 1.95 }],
    });
    expect(withBook.books).toEqual([{
      eventId: "99",
      period: 0,
      market: "totals",
      line: 2.5,
      nvpHome: 0,
      nvpAway: 0,
      nvpOver: 1.9,
      nvpUnder: 1.95,
    }]);
    expect(parsePodDropAlert({})).toBeNull();
  });

  it("formats relative time and freshness", () => {
    const now = 1_000_000;
    expect(formatPodAgo(now - 12_000, now)).toBe("12秒前");
    expect(formatPodAgo(now - 180_000, now)).toBe("3分钟前");
    expect(isFreshPodAlert(now - 10_000, now)).toBe(true);
    expect(isFreshPodAlert(now - 120_000, now)).toBe(false);
  });
});
