/**
 * sport_predictfun_fetch 过滤冒烟（无网络）
 * 用法：node server/backend/core/esport-api/sport_predictfun_fetch.smoke.test.mjs
 */
import assert from "node:assert/strict";
import {
  isPredictSportMoneylineCategory,
  mapPredictSportTag,
  resolveSportGameCodeFromCategory,
} from "./sport_predictfun_fetch.js";

assert.equal(mapPredictSportTag("MLB"), "mlb");
assert.equal(mapPredictSportTag("Baseball"), "mlb");
assert.equal(mapPredictSportTag("Soccer"), "soccer");
assert.equal(mapPredictSportTag("EPL"), "soccer");
assert.equal(mapPredictSportTag("World Cup"), "soccer");
assert.equal(mapPredictSportTag("Football"), null); // 歧义，需与 Soccer 标签组合
assert.equal(mapPredictSportTag("cs2"), null);
assert.equal(mapPredictSportTag("NFL"), null);

assert.equal(resolveSportGameCodeFromCategory({
  tags: [{ name: "Sports" }, { name: "Soccer" }, { name: "Football" }],
}), "soccer");

assert.equal(resolveSportGameCodeFromCategory({
  tags: [{ name: "Sports" }, { name: "MLB" }, { name: "Baseball" }],
}), "mlb");

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
      { name: "OAK", onChainId: "h", team: { name: "Athletics" } },
      { name: "ARI", onChainId: "a", team: { name: "Diamondbacks" } },
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
