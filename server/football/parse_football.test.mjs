import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFootballMatchFromEvent,
  decimalOddsFromProbability,
  isPrimaryMatchEvent,
  parseFootballScore,
  parseTeamsFromTitle,
} from "./parse_football.js";
import { filterSoccerLeagues, isSoccerSportRow } from "./sport_filter.js";

test("parseFootballScore", () => {
  assert.deepEqual(parseFootballScore("000-000|2-1"), { home: 2, away: 1 });
  assert.deepEqual(parseFootballScore("1-0"), { home: 1, away: 0 });
  assert.equal(parseFootballScore(""), null);
});

test("parseTeamsFromTitle", () => {
  assert.deepEqual(
    parseTeamsFromTitle("SK Brann vs. IK Start"),
    { home: "SK Brann", away: "IK Start" },
  );
  assert.deepEqual(
    parseTeamsFromTitle("Premier League: Arsenal vs Chelsea (Matchday 12)"),
    { home: "Arsenal", away: "Chelsea" },
  );
});

test("isPrimaryMatchEvent excludes sub-markets", () => {
  assert.equal(isPrimaryMatchEvent("SK Brann vs. IK Start"), true);
  assert.equal(isPrimaryMatchEvent("SK Brann vs. IK Start - Exact Score"), false);
});

test("decimalOddsFromProbability", () => {
  assert.equal(decimalOddsFromProbability(0.5), 2);
  assert.equal(decimalOddsFromProbability(0), 0);
});

test("buildFootballMatchFromEvent yes/no soccer markets", () => {
  const event = {
    id: "evt1",
    slug: "nor-bra-ik-2026-07-12",
    title: "SK Brann vs. IK Start",
    startTime: "2026-07-12T15:00:00Z",
    markets: [
      {
        question: "Will SK Brann win on 2026-07-12?",
        clob_token_ids: "[\"hYes\",\"hNo\"]",
        outcomes: "[\"Yes\",\"No\"]",
      },
      {
        question: "Will IK Start win on 2026-07-12?",
        clob_token_ids: "[\"aYes\",\"aNo\"]",
        outcomes: "[\"Yes\",\"No\"]",
      },
    ],
  };
  const league = { sport: "nor", name: "Eliteserien", series: "10362" };
  const row = buildFootballMatchFromEvent(event, league, { hYes: 0.5, aYes: 0.25 });
  assert.ok(row);
  assert.equal(row.HomeTeam, "SK Brann");
  assert.equal(row.AwayTeam, "IK Start");
  assert.equal(row.Odds.home, 2);
  assert.equal(row.Odds.away, 4);
});

test("isSoccerSportRow uses tag 100350", () => {
  assert.equal(isSoccerSportRow({ sport: "epl", tags: "1,100350" }), true);
  assert.equal(isSoccerSportRow({ sport: "cs2", tags: "1,64,100639" }), false);
});

test("filterSoccerLeagues dedupes series", () => {
  const rows = filterSoccerLeagues([
    { sport: "epl", tags: "1,100350", series: "10188" },
    { sport: "epl", tags: "1,100350", series: "10188" },
    { sport: "lal", tags: "1,100350", series: "10193" },
  ]);
  assert.equal(rows.length, 2);
});
