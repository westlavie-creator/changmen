import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bestSxDecimalOddsFromBestRow,
  buildSxMappedMarket,
  isSxEsportsMoneylineMarket,
  mapSxLeagueToGameCode,
  sxImpliedToDecimal,
  sxRawOddsToImplied,
} from "./parse.js";

const SAMPLE_MARKET = {
  status: "ACTIVE",
  marketHash: "0xe78e9f55af40c1379097995493604e9ff8fb9944a560f990130e493df747d0b7",
  outcomeOneName: "Lyon Gaming",
  outcomeTwoName: "Team Secret",
  teamOneName: "Lyon Gaming",
  teamTwoName: "Team Secret",
  type: 52,
  gameTime: 1783479600,
  sportXeventId: "L19410579",
  liveEnabled: false,
  sportLabel: "E Sports",
  sportId: 9,
  leagueId: 1378,
  leagueLabel: "LOL - MSI",
};

describe("sxbet-collector parse", () => {
  it("maps league labels to catalog codes", () => {
    assert.equal(mapSxLeagueToGameCode("LOL - MSI"), "lol");
    assert.equal(mapSxLeagueToGameCode("CS2 - Major"), "cs2");
    assert.equal(mapSxLeagueToGameCode("Unknown League"), null);
  });

  it("detects esports moneyline markets", () => {
    assert.equal(isSxEsportsMoneylineMarket(SAMPLE_MARKET), true);
    assert.equal(isSxEsportsMoneylineMarket({ ...SAMPLE_MARKET, type: 1536 }), false);
  });

  it("builds mapped market from best-odds row", () => {
    const row = {
      marketHash: SAMPLE_MARKET.marketHash,
      outcomeOne: { percentageOdds: "63375000000000000000" },
      outcomeTwo: { percentageOdds: "32375000000000000000" },
    };
    assert.equal(sxRawOddsToImplied("63375000000000000000"), 0.63375);
    const mapped = buildSxMappedMarket(SAMPLE_MARKET, row);
    assert.ok(mapped);
    assert.equal(mapped.match.SourceGameID, "lol");
    assert.equal(mapped.bet.SourceBetID, SAMPLE_MARKET.marketHash);
    assert.equal(mapped.bet.HomeOdds, bestSxDecimalOddsFromBestRow(row, true));
    assert.equal(mapped.bet.AwayOdds, bestSxDecimalOddsFromBestRow(row, false));
    assert.equal(mapped.bet.HomeOdds, sxImpliedToDecimal(0.67625));
    assert.equal(mapped.bet.Status, "Normal");
  });
});
