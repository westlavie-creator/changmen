import { describe, expect, it } from "vitest";
import { assessValueBetFromDefaultOdds } from "@/extensions/arbBet/valueBet";

describe("assessValueBetFromDefaultOdds", () => {
  const legs = {
    homeItem: { type: "PB" as const },
    awayItem: { type: "RAY" as const },
    homeOdds: 2.1,
    awayOdds: 2.0,
  };

  it("returns ok=false when default odds missing", () => {
    const r = assessValueBetFromDefaultOdds(0, 1.9, legs);
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("初赔未齐");
  });

  it("detects value when current odds beat fair line from 初赔", () => {
    const r = assessValueBetFromDefaultOdds(1.9, 1.9, legs);
    expect(r.ok).toBe(true);
    expect(r.isValue).toBe(true);
    expect(r.legs.find((l) => l.side === "Home")?.isValue).toBe(true);
  });

  it("returns not value when both legs below fair EV", () => {
    const r = assessValueBetFromDefaultOdds(2.05, 2.05, {
      ...legs,
      homeOdds: 2.0,
      awayOdds: 2.0,
    });
    expect(r.ok).toBe(true);
    expect(r.isValue).toBe(false);
  });
});
