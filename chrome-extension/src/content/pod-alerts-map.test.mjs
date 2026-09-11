import assert from "node:assert/strict";
import { mapPodAlert, mapPodAlertRows } from "./pod-alerts-map.js";

assert.equal(mapPodAlert(null), null);
assert.equal(mapPodAlert({}), null);

const mapped = mapPodAlert({
  alertId: "1789129099840-0",
  ext_event_id: "1635745121",
  stripeRow: true,
  market: "Totals",
  starts: 1789135200000,
  homeTeam: "Neptunas Klaipeda",
  awayTeam: "Jonava",
  period: 0,
  leagueName: "Lithuania - 1 Lyga",
  rowOutcome: "over",
  alertInfo: { alertedAt: "1789129099755", interval: 300000, nickname: "Football" },
  points: 3,
  previous: "2.33",
  current: "1.952",
  noVigPrice: "2.17",
  percentageChange: 16.22317596566524,
  sportId: 1,
  lineType: "total",
});
assert.equal(mapped.id, "1789129099840-0");
assert.equal(mapped.home, "Neptunas Klaipeda");
assert.equal(mapped.away, "Jonava");
assert.equal(mapped.nvp, 2.17);
assert.equal(mapped.current, 1.952);
assert.equal(mapped.outcome, "over");
assert.equal(mapped.points, 3);
assert.equal(mapped.sport, "Football");
assert.equal(mapped.alertedAt, 1789129099755);

const card = mapPodAlert({
  id: "1789130669123-0",
  eventId: "1636021051",
  nickname: "Football",
  leagueName: "Oman - Pro League",
  home: "Sur",
  away: "Bahla",
  starts: "1789133400000",
  timestamp: "1789130667911",
  lineType: "spread",
  periodNumber: "0",
  outcome: "away",
  points: "0",
  changeFrom: "1.884",
  changeTo: "1.689",
  noVigPrice: "",
  percentageChange: "10.350318471337571",
  sportId: "1",
});
assert.equal(card.id, "1789130669123-0");
assert.equal(card.home, "Sur");
assert.equal(card.away, "Bahla");
assert.equal(card.outcome, "away");
assert.equal(card.previous, 1.884);
assert.equal(card.current, 1.689);
assert.equal(card.nvp, 0);
assert.ok(Math.abs(card.dropPct - 10.350318471337571) < 1e-9);
assert.equal(card.alertedAt, 1789130667911);
assert.equal(card.period, 0);
assert.equal(card.sport, "Football");

const batch = mapPodAlertRows([
  { alertId: "b", current: "1.9", noVigPrice: "1.8", percentageChange: 1, alertInfo: { alertedAt: "2" } },
  { alertId: "a", current: "2.0", noVigPrice: "1.9", percentageChange: 2, alertInfo: { alertedAt: "9" } },
  { foo: 1 },
]);
assert.equal(batch.alerts.length, 2);
assert.equal(batch.alerts[0].id, "a");
assert.equal(batch.alerts[1].id, "b");
assert.ok(batch.fingerprint.includes("a:2:1.9:2"));

console.log("pod-alerts-map ok");
