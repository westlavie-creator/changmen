import assert from "node:assert/strict";

const {
  normalizeEpochMs,
  parseVenueCreateAt,
  a8StartTimeListAllowed,
  IM_ODDS_ACTIVE_MS,
} = await import("./match_time.mjs");

assert.equal(normalizeEpochMs(1700000000), 1700000000000);
assert.equal(normalizeEpochMs(1700000000000), 1700000000000);
assert.equal(parseVenueCreateAt(1700000000), 1700000000000);
assert.equal(parseVenueCreateAt("2026-06-14 15:30:00"), Date.parse("2026-06-14T15:30:00"));
assert.equal(parseVenueCreateAt("1700000000000"), 1700000000000);
assert.equal(a8StartTimeListAllowed(0), true);
assert.equal(IM_ODDS_ACTIVE_MS, 3 * 60 * 60 * 1000);

console.log("match_time_smoke: ok");
