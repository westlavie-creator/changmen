/**
 * sport_venue_ingest / pair key 单元冒烟（无 DB）。
 */
import assert from "node:assert/strict";
import {
  clientMatchDtosToSportVenueRows,
  normTeamName,
  sportMergedMatchId,
  sportPairKey,
} from "./sport_venue_ingest.js";

assert.equal(normTeamName("New York Yankees"), "new york yankees");
assert.equal(
  sportPairKey("A's", "B's", 1_700_000_000_000),
  sportPairKey("B's", "A's", 1_700_000_000_000),
);
assert.equal(sportPairKey("Yankees", "Red Sox", 0), null);
assert.equal(sportPairKey("Yankees", "Red Sox", null), null);

const list = [{
  ID: 1,
  Title: "Yankees vs Red Sox",
  Game: "mlb",
  StartTime: 1_700_000_000_000,
  Matchs: { Polymarket: "pm1" },
  Bets: [{
    ID: 11,
    Map: 0,
    Name: "Moneyline",
    HomeName: "Yankees",
    AwayName: "Red Sox",
    Sources: {
      Polymarket: {
        Type: "Polymarket",
        BetID: "b1",
        HomeID: "h1",
        AwayID: "a1",
        HomeOdds: 1.9,
        AwayOdds: 2.1,
        Status: "Normal",
      },
    },
  }],
}, {
  ID: 2,
  Title: "Yankees vs Red Sox",
  Game: "mlb",
  StartTime: 1_700_000_000_000,
  Matchs: { PredictFun: "pf1" },
  Bets: [{
    ID: 22,
    Map: 0,
    Name: "Moneyline",
    HomeName: "Red Sox",
    AwayName: "Yankees",
    Sources: {
      PredictFun: {
        Type: "PredictFun",
        BetID: "b2",
        HomeID: "h2",
        AwayID: "a2",
        HomeOdds: 2.0,
        AwayOdds: 1.8,
        Status: "Normal",
      },
    },
  }],
}];

const { matches, bets } = clientMatchDtosToSportVenueRows("baseball", list);
assert.equal(matches.length, 2);
assert.equal(bets.length, 2);
assert.ok(matches.every(m => m.sport === "baseball"));
assert.ok(matches.every(m => m.venue === "Polymarket" || m.venue === "PredictFun"));
assert.ok(!matches.some(m => "platform" in m));

const k1 = sportPairKey("Yankees", "Red Sox", 1_700_000_000_000);
const k2 = sportPairKey("Red Sox", "Yankees", 1_700_000_000_000);
assert.equal(k1, k2);
assert.equal(sportMergedMatchId("baseball", k1), sportMergedMatchId("baseball", k1));
assert.notEqual(sportMergedMatchId("baseball", k1), sportMergedMatchId("football", k1));

console.log("sport_venue_ingest.smoke: ok");
