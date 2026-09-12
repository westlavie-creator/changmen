import { describe, expect, it } from "vitest";
import type { PodDropAlert } from "@/runtime/podAlerts";
import { POD_BET_SETTINGS_DEFAULTS } from "@/runtime/podBetSettings";
import { buildPodBetTicket } from "@/runtime/podBetTicket";
import { scorePodYaboFollow } from "@/runtime/podYabo/score";

const kick = 1_800_000_000_000;

function alert(over: Partial<PodDropAlert> = {}): PodDropAlert {
  return {
    id: "1",
    eventId: "e",
    sport: "Football",
    sportId: 1,
    league: "EPL",
    home: "A",
    away: "B",
    starts: kick,
    alertedAt: kick - 10_000,
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

describe("podYabo/score", () => {
  it("scores an exact OB totals line with the alert NVP", () => {
    const ticket = buildPodBetTicket(alert(), { ...POD_BET_SETTINGS_DEFAULTS, enabled: true }, kick - 10_000)!;
    const scored = scorePodYaboFollow(ticket, {
      fixture: {
        markets: [{
          id: 1,
          marketCode: "totals",
          line: 2.5,
          name: "全场大小 2.5",
          ob: true,
          quoteHome: 1.95,
          quoteAway: 1.85,
          quoteDraw: 0,
        }],
      },
      settings: POD_BET_SETTINGS_DEFAULTS,
    });
    expect(scored.marketMatch.status).toBe("matched");
    expect(scored.marketMatch.loose).toBe(false);
    expect(scored.nvp).toBe(1.85);
    expect(scored.obQuote.status).toBe("ok");
    expect(scored.obQuote.evPercent).toBeCloseTo(5.41, 1);
  });
});
