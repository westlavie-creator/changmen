import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARP_PLATFORM,
  clampValueBetEdgePctRange,
  clampValueBetOddsRange,
  coerceValueBetAutoBetRuntime,
  evMarkerFloor,
  normalizeValueBetOdds,
  resolveSoftPlatforms,
  valueBetCalcOptsFromPrefs,
} from "@/extensions/valueBet/evConfig";

describe("resolveSoftPlatforms", () => {
  it("excludes PB and keeps RAY when sharp is PB", () => {
    const soft = resolveSoftPlatforms("PB");
    expect(soft).not.toContain("PB");
    expect(soft).toContain("RAY");
    expect(soft).toContain("OB");
  });

  it("excludes RAY and includes PB when sharp is RAY", () => {
    const soft = resolveSoftPlatforms("RAY");
    expect(soft).not.toContain("RAY");
    expect(soft).toContain("PB");
    expect(soft).toContain("OB");
  });
});

describe("valueBetCalcOptsFromPrefs", () => {
  it("defaults to PB / 3% with near floor 1%", () => {
    const opts = valueBetCalcOptsFromPrefs(null);
    expect(opts.sharp).toBe(DEFAULT_SHARP_PLATFORM);
    expect(opts.minEdge).toBe(0.03);
    expect(opts.nearEdge).toBe(0.01);
    expect(opts.softPlatforms).toEqual(resolveSoftPlatforms("PB"));
  });

  it("reads RAY baseline and minEdge; near stays 1%", () => {
    const opts = valueBetCalcOptsFromPrefs({ sharp: "RAY", minEdgePct: 5 });
    expect(opts.sharp).toBe("RAY");
    expect(opts.minEdge).toBe(0.05);
    expect(opts.nearEdge).toBe(0.01);
    expect(opts.softPlatforms).toEqual(resolveSoftPlatforms("RAY"));
  });

  it("caps near at minEdge when 正EV is below 1%", () => {
    const opts = valueBetCalcOptsFromPrefs({ minEdgePct: 0.5 });
    expect(opts.minEdge).toBe(0.005);
    expect(opts.nearEdge).toBe(0.005);
    expect(evMarkerFloor(opts.nearEdge, opts.minEdge)).toBe(0.005);
  });

  it("clamps out-of-range minEdge instead of reverting to defaults", () => {
    const opts = valueBetCalcOptsFromPrefs({ minEdgePct: 99 });
    expect(opts.minEdge).toBe(0.2);
    expect(opts.nearEdge).toBe(0.01);
  });
});

describe("valueBet autoBet range helpers", () => {
  it("clamps maxOdds up to minOdds when inverted", () => {
    expect(clampValueBetOddsRange(2.5, 1.2)).toEqual({ minOdds: 2.5, maxOdds: 2.5 });
    expect(clampValueBetOddsRange(1.3, 10)).toEqual({ minOdds: 1.3, maxOdds: 10 });
  });

  it("clamps maxEdgePct up to minEdgePct when inverted", () => {
    expect(clampValueBetEdgePctRange(8, 3)).toEqual({ minEdgePct: 8, maxEdgePct: 8 });
    expect(clampValueBetEdgePctRange(3, 8)).toEqual({ minEdgePct: 3, maxEdgePct: 8 });
  });

  it("clamps odds to 1.01–20", () => {
    expect(normalizeValueBetOdds(0.5, 1.3)).toBe(1.01);
    expect(normalizeValueBetOdds(99, 10)).toBe(20);
    expect(normalizeValueBetOdds("1.85", 1.3)).toBe(1.85);
  });

  it("coerces cleared autoBet fields to defaults instead of 0", () => {
    expect(coerceValueBetAutoBetRuntime({
      minEdgePct: null,
      maxEdgePct: null,
      minOdds: null,
      maxOdds: null,
      maxPerMap: null,
    })).toEqual({
      minEdgePct: 3,
      maxEdgePct: 20,
      minOdds: 1.3,
      maxOdds: 10,
      maxPerMap: 1,
      minEdge: 0.03,
      maxEdge: 0.2,
    });
  });
});
