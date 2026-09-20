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
    expect(row.obStake).toBe(0);
    expect(row.pmStake).toBe(0);
    expect(parsePodBetSettings({ stake: 100, obStake: 50, pmStake: 200 }).stake).toBe(100);
    expect(parsePodBetSettings({ stake: 100, obStake: 50, pmStake: 200 }).obStake).toBe(50);
    expect(parsePodBetSettings({ stake: 100, obStake: 50, pmStake: 200 }).pmStake).toBe(200);
    expect(row.autoPlace).toBe(false);
    expect(row.followAccountId).toBe(0);
    expect(row.followAccountIds).toEqual([]);
    expect(row.pmFollowAccountIds).toEqual([]);
    expect(row.followVenues).toEqual(["OB"]);
    expect(parsePodBetSettings({ followAccountId: 12 }).followAccountIds).toEqual([12]);
    expect(parsePodBetSettings({ followAccountIds: [3, 3, 5], followAccountId: 9 }).followAccountIds).toEqual([3, 5]);
    expect(parsePodBetSettings({ followAccountIds: [3, 5] }).followAccountId).toBe(3);
    expect(parsePodBetSettings({ pmFollowAccountIds: [7, 7, 8] }).pmFollowAccountIds).toEqual([7, 8]);
    expect(parsePodBetSettings({ followVenues: ["Polymarket", "OB", "Polymarket"] }).followVenues).toEqual(["Polymarket", "OB"]);
    expect(parsePodBetSettings({ followVenues: [] }).followVenues).toEqual(["OB"]);
    expect(row.maxDailyLoss).toBe(0);
    expect(row.prematchOnly).toBe(true);
    expect(row.spreads).toBe(false);
    expect(row.maxObEdgePct).toBe(18);
    expect(row.spreadObEdgePct).toBe(8);
    expect(row.lineMatch).toBe("strict");
    expect(POD_FOLLOW_STAKE_PRESETS).toEqual([50, 100, 200, 500]);
    const emptyMarkets = parsePodBetSettings({ moneyline: false, totals: false, spreads: false });
    expect(emptyMarkets.moneyline).toBe(true);
    expect(emptyMarkets.totals).toBe(true);
    expect(emptyMarkets.spreads).toBe(false);
    expect(parsePodBetSettings({ autoPlace: true }).autoPlace).toBe(true);
    expect(parsePodBetSettings({ lineMatch: "loose" }).lineMatch).toBe("loose");
    expect(POD_BET_SETTINGS_DEFAULTS.maxAgeSec).toBe(45);
    // 撤回误默认 180；上一版 30 并入 45
    expect(parsePodBetSettings({ maxAgeSec: 180 }).maxAgeSec).toBe(45);
    expect(parsePodBetSettings({ maxAgeSec: 30 }).maxAgeSec).toBe(45);
    expect(parsePodBetSettings({ maxAgeSec: 60 }).maxAgeSec).toBe(60);
  });

  it("classifies line kinds", () => {
    expect(podAlertLineKind(alert())).toBe("totals");
    expect(podAlertLineKind(alert({ lineType: "spread", market: "Match", outcome: "away" }))).toBe("spreads");
    expect(podAlertLineKind(alert({ lineType: "moneyline", market: "ML", outcome: "home" }))).toBe("moneyline");
    expect(podAlertLineKind(alert({ lineType: "moneyline", market: "Tournament", outcome: "home" }))).toBe("moneyline");
    expect(podAlertLineKind(alert({ market: "Team Total", lineType: "total", outcome: "over" }))).toBe("other");
  });

  it("keeps a conservative football totals drop and drops live/spread/stale", () => {
    const s = { ...POD_BET_SETTINGS_DEFAULTS, enabled: true };
    const now = 1_960_000;
    expect(podAlertPassesBetGate(alert(), s, now)).toBe(true);
    expect(podAlertPassesBetGate(alert({ starts: now - 1 }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ lineType: "spread", market: "AH", outcome: "home" }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ alertedAt: now - 200_000 }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ sportId: 3, sport: "Tennis" }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ period: 1 }), s, now)).toBe(false);
    expect(podAlertPassesBetGate(alert({ period: 1 }), { ...s, includeHt: true }, now)).toBe(true);
    const off = { ...s, enabled: false };
    expect(filterPodAlertsForBet([alert({ sportId: 3, sport: "Tennis" })], off, now)).toHaveLength(1);
  });
});
