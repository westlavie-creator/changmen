import assert from "node:assert/strict";
import test from "node:test";
import { SOCCER_TAG, filterSoccerLeagues, isSoccerSportRow } from "./sport_filter.js";

test("SOCCER_TAG constant", () => {
  assert.equal(SOCCER_TAG, "100350");
});

test("filterSoccerLeagues excludes esports", () => {
  const rows = filterSoccerLeagues([
    { sport: "cs2", tags: "1,64,100639", series: "10310" },
    { sport: "epl", tags: "1,82,100350", series: "10188" },
    { sport: "nba", tags: "1,745,100639", series: "10345" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sport, "epl");
});

test("isSoccerSportRow requires sport key", () => {
  assert.equal(isSoccerSportRow({ tags: "100350" }), false);
});
