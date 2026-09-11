import { describe, expect, it } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import {
  filterPodAlertsForBet,
  POD_FOLLOW_STAKE_PRESETS,
  parsePodBetSettings,
  podAlertLineKind,
  podAlertPassesBetGate,
  POD_BET_SETTINGS_DEFAULTS,
} from "@/runtime/podBetSettings";

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

describe("podBetSettings", () => {
  it("clamps and fills defaults", () => {
    const row = parsePodBetSettings({ enabled: true, minDropPct: 999, stake: -1 });
    expect(row.minDropPct).toBe(80);
    expect(row.stake).toBe(0);
    expect(row.prematchOnly).toBe(true);
    expect(row.spreads).toBe(false);
    expect(POD_FOLLOW_STAKE_PRESETS).toEqual([50, 100, 200, 500]);
    const emptyMarkets = parsePodBetSettings({ moneyline: false, totals: false, spreads: false });
    expect(emptyMarkets.moneyline).toBe(true);
    expect(emptyMarkets.totals).toBe(true);
    expect(emptyMarkets.spreads).toBe(false);
  });

  it("classifies line kinds", () => {
    expect(podAlertLineKind(alert())).toBe("totals");
    expect(podAlertLineKind(alert({ lineType: "spread", market: "Match", outcome: "away" }))).toBe("spreads");
    expect(podAlertLineKind(alert({ lineType: "moneyline", market: "ML", outcome: "home" }))).toBe("moneyline");
    expect(podAlertLineKind(alert({ lineType: "moneyline", market: "Tournament", outcome: "home" }))).toBe("moneyline");
  });

  it("keeps a conservative football totals drop and drops live/spread/stale", () => {
    const s = { ...POD_BET_SETTINGS_DEFAULTS, enabled: true };
    const now = 1_960_000;
    expect(podAlertPassesBetGate(alert(), s, now)).toBe(true);
    expect(podAlertPassesBetGate(alert({ starts: now - 1 }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ lineType: "spread", market: "AH", outcome: "home" }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ alertedAt: now - 120_000 }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ sportId: 3, sport: "Tennis" }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ period: 1 }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ period: 1 }), { ...s, includeHt: true }, now)).toBe(true);
    const off = { ...s, enabled: false };
    expect(filterPodAlertsForBet([alert({ sportId: 3, sport: "Tennis" })], off, now)).toHaveLength(1);
  });
});
