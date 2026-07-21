import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  bestSxDecimalOdds,
  bestSxDecimalOddsFromBestRow,
  buildSxMappedMarket,
  isSxEsportsMoneylineMarket,
  mapSxLeagueToGameCode,
  sxDecimalToProtocolOdds,
  sxImpliedToDecimal,
  sxRawOddsToImplied,
} from "./parse";
import type { SxMarket, SxOrder } from "./api";

const SAMPLE_MARKET: SxMarket = {
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

const SAMPLE_ORDERS: SxOrder[] = [
  {
    marketHash: SAMPLE_MARKET.marketHash,
    percentageOdds: "63375000000000000000",
    isMakerBettingOutcomeOne: true,
    orderStatus: "ACTIVE",
  },
  {
    marketHash: SAMPLE_MARKET.marketHash,
    percentageOdds: "32375000000000000000",
    isMakerBettingOutcomeOne: false,
    orderStatus: "ACTIVE",
  },
];

describe("sxbet parse", () => {
  it("maps league labels to catalog codes", () => {
    assert.equal(mapSxLeagueToGameCode("LOL - MSI"), "lol");
    assert.equal(mapSxLeagueToGameCode("CS2 - Major"), "cs2");
    assert.equal(mapSxLeagueToGameCode("Unknown League"), null);
  });

  it("detects esports moneyline markets", () => {
    assert.equal(isSxEsportsMoneylineMarket(SAMPLE_MARKET), true);
    assert.equal(isSxEsportsMoneylineMarket({ ...SAMPLE_MARKET, type: 1536 }), false);
  });

  it("converts raw odds to decimal", () => {
    assert.equal(sxRawOddsToImplied("63375000000000000000"), 0.63375);
    assert.equal(sxImpliedToDecimal(0.5), 2);
  });

  it("picks best taker odds from orderbook", () => {
    assert.equal(bestSxDecimalOdds(SAMPLE_ORDERS, true), sxImpliedToDecimal(0.67625));
    assert.equal(bestSxDecimalOdds(SAMPLE_ORDERS, false), sxImpliedToDecimal(0.36625));
  });

  it("picks best taker odds from /orders/odds/best row", () => {
    const row = {
      marketHash: SAMPLE_MARKET.marketHash,
      outcomeOne: { percentageOdds: "63375000000000000000" },
      outcomeTwo: { percentageOdds: "32375000000000000000" },
    };
    // taker on outcome one faces maker-on-two
    assert.equal(bestSxDecimalOddsFromBestRow(row, true), sxImpliedToDecimal(0.67625));
    assert.equal(bestSxDecimalOddsFromBestRow(row, false), sxImpliedToDecimal(0.36625));
  });

  it("converts decimal odds to protocol format", () => {
    assert.equal(sxDecimalToProtocolOdds(2), "50000000000000000000");
  });

  it("builds mapped market", () => {
    const mapped = buildSxMappedMarket(SAMPLE_MARKET, SAMPLE_ORDERS);
    assert.ok(mapped);
    assert.equal(mapped!.match.SourceGameID, "lol");
    assert.equal(mapped!.bet.SourceBetID, SAMPLE_MARKET.marketHash);
    assert.equal(mapped!.bet.HomeOdds, bestSxDecimalOdds(SAMPLE_ORDERS, true));
    assert.equal(mapped!.bet.AwayOdds, bestSxDecimalOdds(SAMPLE_ORDERS, false));
    assert.equal(mapped!.bet.Status, "Normal");
  });

  it("builds mapped market from best-odds row", () => {
    const row = {
      marketHash: SAMPLE_MARKET.marketHash,
      outcomeOne: { percentageOdds: "63375000000000000000" },
      outcomeTwo: { percentageOdds: "32375000000000000000" },
    };
    const mapped = buildSxMappedMarket(SAMPLE_MARKET, [], row);
    assert.ok(mapped);
    assert.equal(mapped!.bet.HomeOdds, bestSxDecimalOddsFromBestRow(row, true));
    assert.equal(mapped!.bet.AwayOdds, bestSxDecimalOddsFromBestRow(row, false));
  });
});
