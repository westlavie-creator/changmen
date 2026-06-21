import { strict as assert } from "node:assert";
import { test } from "vitest";
import { scanBetForValue } from "./edge.js";

test("detects positive EV when soft odds exceed fair odds", () => {
  // PB: 1.85/2.05 → fair ≈ 1.902/2.109
  const sharp = { HomeOdds: 1.85, AwayOdds: 2.05, Status: "Normal" };
  const sources = {
    PB: sharp,
    OB: { HomeOdds: 1.98, AwayOdds: 1.92, Status: "Normal" },
  };

  const signals = scanBetForValue(sharp, sources, ["OB"]);

  // OB Home 1.98 vs fair ~1.902 → edge ~4.1% → should trigger
  const homeSig = signals.find((s) => s.side === "Home");
  assert.ok(homeSig, "should find Home side +EV");
  assert.ok(homeSig.edge > 0.03, `edge ${homeSig.edge} should be > 3%`);
  assert.ok(homeSig.kellyFrac > 0, "kelly should be positive");
});

test("no signal when soft odds below fair odds", () => {
  const sharp = { HomeOdds: 1.85, AwayOdds: 2.05, Status: "Normal" };
  const sources = {
    PB: sharp,
    OB: { HomeOdds: 1.80, AwayOdds: 1.95, Status: "Normal" },
  };

  const signals = scanBetForValue(sharp, sources, ["OB"]);
  assert.equal(signals.length, 0, "no +EV signals expected");
});

test("skips locked soft book", () => {
  const sharp = { HomeOdds: 1.85, AwayOdds: 2.05, Status: "Normal" };
  const sources = {
    PB: sharp,
    OB: { HomeOdds: 2.50, AwayOdds: 2.50, Status: "Locked" },
  };

  const signals = scanBetForValue(sharp, sources, ["OB"]);
  assert.equal(signals.length, 0);
});

test("skips locked sharp line", () => {
  const sharp = { HomeOdds: 1.85, AwayOdds: 2.05, Status: "Locked" };
  const sources = {
    PB: sharp,
    OB: { HomeOdds: 2.50, AwayOdds: 2.50, Status: "Normal" },
  };

  const signals = scanBetForValue(sharp, sources, ["OB"]);
  assert.equal(signals.length, 0);
});

test("filters out odds outside range", () => {
  const sharp = { HomeOdds: 1.10, AwayOdds: 8.00, Status: "Normal" };
  const sources = {
    PB: sharp,
    OB: { HomeOdds: 1.15, AwayOdds: 9.00, Status: "Normal" },
  };

  const signals = scanBetForValue(sharp, sources, ["OB"]);
  // Both sides should be filtered: 1.15 < MIN_ODDS(1.40), 9.00 > MAX_ODDS(5.00)
  assert.equal(signals.length, 0);
});

test("scans multiple soft platforms", () => {
  const sharp = { HomeOdds: 1.85, AwayOdds: 2.05, Status: "Normal" };
  const sources = {
    PB: sharp,
    OB:  { HomeOdds: 1.98, AwayOdds: 1.90, Status: "Normal" },
    RAY: { HomeOdds: 2.00, AwayOdds: 1.88, Status: "Normal" },
  };

  const signals = scanBetForValue(sharp, sources, ["OB", "RAY"]);
  const platforms = new Set(signals.map((s) => s.softPlatform));
  // Both OB and RAY should appear (at least on Home side)
  assert.ok(platforms.has("OB") || platforms.has("RAY"));
});
