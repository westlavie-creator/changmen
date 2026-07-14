/**
 * sport_predictfun_fetch 过滤冒烟（无网络）
 * 用法：node server/backend/core/esport-api/sport_predictfun_fetch.smoke.test.mjs
 */
import assert from "node:assert/strict";
import {
  isPredictSportMoneylineCategory,
  mapPredictSportTag,
  outcomeProb,
  readPredictTopPrice,
  resolveSportGameCodeFromCategory,
} from "./sport_predictfun_fetch.js";

assert.equal(mapPredictSportTag("MLB"), "mlb");
assert.equal(mapPredictSportTag("Baseball"), "mlb");
assert.equal(mapPredictSportTag("Soccer"), "soccer");
assert.equal(mapPredictSportTag("EPL"), "soccer");
assert.equal(mapPredictSportTag("World Cup"), "soccer");
assert.equal(mapPredictSportTag("Football"), null);
assert.equal(mapPredictSportTag("cs2"), null);
assert.equal(mapPredictSportTag("NFL"), null);

assert.equal(resolveSportGameCodeFromCategory({
  tags: [{ name: "Sports" }, { name: "Soccer" }, { name: "Football" }],
}), "soccer");

assert.equal(resolveSportGameCodeFromCategory({
  tags: [{ name: "Sports" }, { name: "MLB" }, { name: "Baseball" }],
}), "mlb");

assert.equal(readPredictTopPrice({ price: 0.42, size: 10 }), 0.42);
assert.equal(readPredictTopPrice(0.55), 0.55);
assert.equal(readPredictTopPrice(null), 0);
assert.equal(outcomeProb({ bestAsk: { price: 0.4, size: 1 } }), 0.4);
assert.equal(outcomeProb({ bestAsk: { price: 0.99, size: 100 }, bestBid: { price: 0.01, size: 100 } }), 0.5);

const mlbCat = {
  marketVariant: "SPORTS_TEAM_MATCH",
  status: "OPEN",
  tags: [{ name: "MLB" }, { name: "Baseball" }],
  markets: [{
    id: 1,
    status: "REGISTERED",
    tradingStatus: "OPEN",
    marketType: "SPORTS_MONEYLINE",
    outcomes: [
      { name: "OAK", onChainId: "h", team: { name: "Athletics" }, bestAsk: { price: 0.45, size: 1 } },
      { name: "ARI", onChainId: "a", team: { name: "Diamondbacks" }, bestAsk: { price: 0.55, size: 1 } },
    ],
  }],
};
assert.equal(isPredictSportMoneylineCategory(mlbCat, "mlb"), true);
assert.equal(isPredictSportMoneylineCategory(mlbCat, "soccer"), false);

const soccerCat = {
  marketVariant: "SPORTS_MATCH",
  status: "OPEN",
  tags: [{ name: "Soccer" }, { name: "UEL" }],
  markets: [
    { id: 1, status: "REGISTERED", tradingStatus: "OPEN", title: "AAA", team: { name: "A" }, outcomes: [{ name: "Yes" }] },
    { id: 2, status: "REGISTERED", tradingStatus: "OPEN", title: "Draw", outcomes: [{ name: "Yes" }] },
    { id: 3, status: "REGISTERED", tradingStatus: "OPEN", title: "BBB", team: { name: "B" }, outcomes: [{ name: "Yes" }] },
  ],
};
assert.equal(isPredictSportMoneylineCategory(soccerCat, "soccer"), true);

console.log("sport_predictfun_fetch.smoke: ok");
