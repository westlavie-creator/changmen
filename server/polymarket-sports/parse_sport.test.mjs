import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPmSportLabel,
  buildPmSportSnapshot,
  parseEsportsScore,
  parsePeriodToCurrentMap,
} from "./parse_sport.js";

test("parseEsportsScore splits map score and bo", () => {
  const row = parseEsportsScore("000-000|2-0|Bo3");
  assert.deepEqual(row.mapScore, { home: 2, away: 0 });
  assert.equal(row.bo, 3);
});

test("parsePeriodToCurrentMap", () => {
  assert.equal(parsePeriodToCurrentMap("2/3"), 2);
  assert.equal(parsePeriodToCurrentMap(undefined), null);
});

test("buildPmSportSnapshot records map winner on score delta", () => {
  const first = buildPmSportSnapshot({
    gameId: 1,
    slug: "cs2-a-b",
    homeTeam: "A",
    awayTeam: "B",
    status: "running",
    live: true,
    ended: false,
    score: "000-000|0-0|Bo3",
    period: "1/3",
  });
  const second = buildPmSportSnapshot({
    gameId: 1,
    slug: "cs2-a-b",
    homeTeam: "A",
    awayTeam: "B",
    status: "running",
    live: true,
    ended: false,
    score: "000-000|1-0|Bo3",
    period: "2/3",
  }, first);
  assert.equal(second.maps.length, 1);
  assert.equal(second.maps[0].winner, "home");
  assert.equal(second.maps[0].winnerName, "A");
});

test("buildPmSportLabel finished", () => {
  assert.equal(
    buildPmSportLabel({ status: "finished", ended: true, mapScore: { home: 2, away: 0 } }),
    "已结束 · 2-0",
  );
});
