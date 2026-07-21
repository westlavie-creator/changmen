import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPredictFunMarketIndexPayload } from "./market_index.js";
import { buildPredictMappedMarket } from "./parse.js";

const SAMPLE_DUAL = {
  id: 9001,
  slug: "team-alpha-vs-team-beta-cs2",
  title: "Team Alpha vs Team Beta",
  status: "OPEN",
  marketVariant: "SPORTS_TEAM_MATCH",
  startsAt: "2026-07-11T12:00:00.000Z",
  tags: [{ id: "11", name: "CS2" }],
  markets: [
    {
      id: 472,
      title: "Team Alpha",
      status: "OPEN",
      tradingStatus: "OPEN",
      marketType: "SPORTS_MONEYLINE",
      decimalPrecision: 2,
      team: { id: 1, name: "Team Alpha", abbreviation: "TA", league: "CS2" },
      outcomes: [
        { name: "Yes", onChainId: "tok-home", indexSet: 1 },
        { name: "No", onChainId: "tok-home-no", indexSet: 2 },
      ],
    },
    {
      id: 473,
      title: "Team Beta",
      status: "OPEN",
      tradingStatus: "OPEN",
      marketType: "SPORTS_MONEYLINE",
      decimalPrecision: 2,
      team: { id: 2, name: "Team Beta", abbreviation: "TB", league: "CS2" },
      outcomes: [
        { name: "Yes", onChainId: "tok-away", indexSet: 1 },
        { name: "No", onChainId: "tok-away-no", indexSet: 2 },
      ],
    },
  ],
};

const SAMPLE_SINGLE = {
  id: 221930,
  slug: "fluxo-vs-lev",
  title: "Fluxo W7M vs LEVIATÁN",
  status: "OPEN",
  marketVariant: "ESPORTS_LOL",
  startsAt: "2026-07-11T12:00:00.000Z",
  tags: [{ name: "LoL" }],
  markets: [
    {
      id: 844582,
      title: "Match Winner",
      status: "OPEN",
      tradingStatus: "OPEN",
      marketType: "SPORTS_MONEYLINE",
      decimalPrecision: 2,
      outcomes: [
        {
          name: "Fluxo W7M",
          indexSet: 1,
          onChainId: "tok-yes-home",
          team: { name: "Fluxo W7M" },
          bestAsk: { price: 0.55 },
        },
        {
          name: "LEVIATÁN",
          indexSet: 2,
          onChainId: "tok-no-away",
          team: { name: "LEVIATÁN" },
          bestAsk: { price: 0.48 },
        },
      ],
    },
  ],
};

describe("predictfun-collector market_index payload", () => {
  it("dual-market entries keep distinct home/away marketIds and clob from each book", () => {
    const mapped = buildPredictMappedMarket(SAMPLE_DUAL, { 472: 0.62, 473: 0.41 });
    assert.ok(mapped);
    assert.equal(mapped.homeMarketId, "472");
    assert.equal(mapped.awayMarketId, "473");

    const payload = buildPredictFunMarketIndexPayload([mapped], {
      472: { asks: [[0.62, 10]], bids: [[0.60, 10]] },
      473: { asks: [[0.41, 10]], bids: [[0.39, 10]] },
    });

    const entry = payload.entries[0];
    assert.equal(entry.homeMarketId, "472");
    assert.equal(entry.awayMarketId, "473");
    assert.equal(entry.homeClobPrice, 0.62);
    assert.equal(entry.awayClobPrice, 0.41);
    assert.equal(entry.yesTokenId, undefined);
  });

  it("single-market entries set yesTokenId and complementary buy clobs", () => {
    const mapped = buildPredictMappedMarket(SAMPLE_SINGLE);
    assert.ok(mapped);
    assert.ok(mapped.bookMetaByMarketId?.["844582"]?.yesTokenId);

    const payload = buildPredictFunMarketIndexPayload([mapped], {
      844582: { asks: [[0.18, 200]], bids: [[0.16, 200]] },
    });

    const entry = payload.entries[0];
    assert.equal(entry.homeMarketId, entry.awayMarketId);
    assert.equal(entry.yesTokenId, "tok-yes-home");
    assert.equal(entry.homeClobPrice, 0.18);
    assert.equal(entry.awayClobPrice, 0.84);
  });
});
