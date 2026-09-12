import assert from "node:assert/strict";
import { it } from "vitest";
import { utcDayRange, utcMonthRange, utcWeekRange } from "./builder_dashboard.js";

it("utcMonthRange is a UTC calendar month half-open interval", () => {
  const r = utcMonthRange("2026-09");
  assert.equal(r.kind, "utcMonth");
  assert.equal(r.timezone, "utc");
  assert.equal(r.monthKey, "2026-09");
  assert.equal(r.startMs, Date.UTC(2026, 8, 1));
  assert.equal(r.endMs, Date.UTC(2026, 9, 1));
  assert.match(r.label, /UTC月 2026-09/);
});

it("utcDayRange stays on UTC midnight", () => {
  const r = utcDayRange("2026-09-12");
  assert.equal(r.startMs, Date.UTC(2026, 8, 12));
  assert.equal(r.endMs, Date.UTC(2026, 8, 13));
  assert.equal(r.timezone, "utc");
});

it("utcWeekRange is Sunday–Saturday UTC", () => {
  const r = utcWeekRange("2026-09-12"); // Saturday
  assert.equal(r.weekStartKey, "2026-09-06");
  assert.equal(r.weekEndKey, "2026-09-12");
  assert.equal(r.startMs, Date.UTC(2026, 8, 6));
  assert.equal(r.endMs, Date.UTC(2026, 8, 13));
});
