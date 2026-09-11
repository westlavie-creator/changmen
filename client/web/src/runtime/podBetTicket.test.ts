import { describe, expect, it } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import { POD_BET_SETTINGS_DEFAULTS } from "@/runtime/podBetSettings";
import {
  buildPodBetTicket,
  formatPodKickoff,
  formatPodStake,
  listPodFollowTickets,
  minObOddsForAlert,
} from "@/runtime/podBetTicket";

function alert(over: Partial<PodDropAlert> = {}): PodDropAlert {
  return {
    id: "1",
    eventId: "e",
    sport: "Football",
    sportId: 1,
    league: "EPL",
    home: "A",
    away: "B",
    starts: 2_000_000,
    alertedAt: 1_950_000,
    market: "Totals",
    lineType: "total",
    period: 0,
    outcome: "over",
    points: 2.5,
    previous: 2.1,
    current: 1.9,
    nvp: 1.85,
    dropPct: 10,
    ways: null,
    ...over,
  };
}

describe("podBetTicket", () => {
  it("builds a follow ticket with min OB from NVP and edge", () => {
    const s = { ...POD_BET_SETTINGS_DEFAULTS, enabled: true, stake: 80 };
    const now = 1_960_000;
    const ticket = buildPodBetTicket(alert(), s, now);
    expect(ticket).not.toBeNull();
    expect(ticket!.sideLabel).toBe("大 2.5");
    expect(ticket!.marketLabel).toContain("大小");
    expect(ticket!.minObOdds).toBe(minObOddsForAlert(alert(), s));
    expect(ticket!.minObOdds).toBe(1.924);
    expect(ticket!.remainSec).toBe(35);
    expect(formatPodStake(ticket!.stake)).toBe("¥80");
    expect(formatPodKickoff(ticket!.starts, now)).toBe("40秒后开");
    expect(formatPodKickoff(now + 30_000, now)).toBe("30秒后开");
    expect(formatPodKickoff(now + 120_000, now)).toBe("2分钟后开");
  });

  it("hides tickets when filter is off, and drops live/spread", () => {
    const now = 1_960_000;
    const on = { ...POD_BET_SETTINGS_DEFAULTS, enabled: true };
    const off = { ...on, enabled: false };
    expect(listPodFollowTickets([alert(), alert({ id: "2", lineType: "spread", market: "AH", outcome: "home" })], on, now)).toHaveLength(1);
    expect(listPodFollowTickets([alert()], off, now)).toHaveLength(0);
  });
});
