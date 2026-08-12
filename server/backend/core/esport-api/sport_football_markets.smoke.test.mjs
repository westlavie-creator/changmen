/**
 * 足球盘口全量展示 / 标题挂接冒烟
 */
import assert from "node:assert/strict";
import {
  FOOTBALL_LEAGUE_CODES,
  baseFootballEventTitle,
  displayBetName,
  encodeSportBetId,
  isFootballSiblingEventTitle,
  marketBetKey,
  pickMainSpreadLine,
  pickMainTotalLine,
  resolveFootballLeagueFromText,
  selectFootballDisplayBets,
  stripFootballHandicapSuffix,
} from "./sport_football_markets.js";

assert.equal(encodeSportBetId(800_000_001, 11), 800_000_001 * 100 + 11);
assert.notEqual(encodeSportBetId(800_000_001, 11), encodeSportBetId(800_000_002, 1));
assert.equal(encodeSportBetId(100, 1), 10001);

assert.equal(
  baseFootballEventTitle("Henan FC vs. Dalian Yingbo FC - More Markets"),
  "Henan FC vs. Dalian Yingbo FC",
);
assert.equal(
  baseFootballEventTitle("Yunnan Yukun FC (-1.5) vs Shenzhen Xinpengcheng FC (-1.5)"),
  "Yunnan Yukun FC vs Shenzhen Xinpengcheng FC",
);
assert.equal(stripFootballHandicapSuffix("Yunnan Yukun FC (-1.5)"), "Yunnan Yukun FC");
assert.equal(
  isFootballSiblingEventTitle("Yunnan Yukun FC (-1.5) vs Shenzhen Xinpengcheng FC (-1.5)"),
  true,
);
assert.equal(pickMainSpreadLine([-2.5, -1.5, 1.5]), -1.5);
assert.equal(pickMainTotalLine([0.5, 1.5, 2.5, 3.5]), 2.5);
assert.equal(marketBetKey("spreads", -1.5), "spreads|-1.5");
assert.equal(displayBetName("spreads", -1.5), "让球 -1.5");
assert.equal(displayBetName("totals", 2.5), "大小 2.5");
assert.equal(resolveFootballLeagueFromText("Premier League"), "epl");
assert.equal(resolveFootballLeagueFromText("Chinese Super League"), "chi");
assert.equal(resolveFootballLeagueFromText("中超"), "chi");
assert.equal(resolveFootballLeagueFromText("中国超级联赛"), "chi");
assert.equal(resolveFootballLeagueFromText("CSL"), "chi");
assert.equal(resolveFootballLeagueFromText("chi"), "chi");
assert.equal(resolveFootballLeagueFromText("chi-hai-jin-2026-07-25"), "chi");
// 无 /u 时 \bchi\b 会误伤 Chişinău（ş 非 ASCII \w）
assert.equal(resolveFootballLeagueFromText("Noah FA vs FC Zimbru Chişinău"), null);
assert.equal(resolveFootballLeagueFromText("Chișinău"), null);
assert.equal(resolveFootballLeagueFromText("mls"), "mls");
assert.equal(resolveFootballLeagueFromText("美国职业大联盟"), "mls");
assert.equal(resolveFootballLeagueFromText("美职联"), "mls");
assert.equal(resolveFootballLeagueFromText("Copa América"), "copa");
assert.equal(resolveFootballLeagueFromText("Copa del Rey"), null);
assert.equal(resolveFootballLeagueFromText("英格兰超级联赛"), "epl");
assert.equal(resolveFootballLeagueFromText("英超"), "epl");
assert.equal(resolveFootballLeagueFromText("欧洲冠军联赛"), "ucl");
assert.equal(resolveFootballLeagueFromText("欧冠"), "ucl");
assert.equal(resolveFootballLeagueFromText("欧洲联赛资格赛"), "uel");
assert.equal(resolveFootballLeagueFromText("欧联资"), "uel");
assert.equal(resolveFootballLeagueFromText("欧洲协会联赛资格赛"), "uecl");
assert.equal(resolveFootballLeagueFromText("欧协资"), "uecl");
assert.equal(resolveFootballLeagueFromText("欧协联"), "uecl");
assert.equal(resolveFootballLeagueFromText("col"), "uecl");
assert.equal(resolveFootballLeagueFromText("UEFA Conference League"), "uecl");
// 裸 uefa 不再落入欧足联宽桶
assert.equal(resolveFootballLeagueFromText("uefa friendly"), null);
assert.equal(resolveFootballLeagueFromText("uef"), "uef");

const { mapObFootballTournamentToGame } = await import("./sport_football_markets.js");
assert.equal(mapObFootballTournamentToGame("180"), "epl");
assert.equal(mapObFootballTournamentToGame("262"), "uel");
assert.equal(mapObFootballTournamentToGame("8120"), "uecl");
assert.equal(mapObFootballTournamentToGame("999999"), null);

const obMap = await import("../../../../packages/shared/catalog/football_ob_league_map.json", {
  with: { type: "json" },
});
assert.equal(obMap.default.source.filter.includes("getFilterMatchListPB"), true);
assert.ok(obMap.default.firstBatch.some(x => x.code === "epl" && x.tournamentId === "180"));
assert.ok(obMap.default.firstBatch.some(x => x.code === "uel" && x.tournamentId === "262" && x.tnjc === "欧联资"));
assert.equal(isFootballSiblingEventTitle("Final 2026 vs Foo"), false);

const sportsCatalog = await import("../../../../packages/shared/catalog/game_catalog_sports.json", {
  with: { type: "json" },
});
const footCodes = sportsCatalog.default.games
  .filter(g => g.sport === "football")
  .map(g => g.code)
  .sort();
assert.deepEqual(footCodes, [...FOOTBALL_LEAGUE_CODES].sort());


const picked = selectFootballDisplayBets([
  { MarketCode: "moneyline", Name: "全场胜负", Line: null },
  { MarketCode: "spreads", Name: "让球 -2.5", Line: -2.5 },
  { MarketCode: "spreads", Name: "让球 -1.5", Line: -1.5 },
  { MarketCode: "totals", Name: "大小 3.5", Line: 3.5 },
  { MarketCode: "totals", Name: "大小 2.5", Line: 2.5 },
  { MarketCode: "totals", Name: "大小 0.5", Line: 0.5 },
]);
assert.equal(picked.length, 6);
assert.equal(picked[0].MarketCode, "moneyline");
assert.deepEqual(picked.filter(b => b.MarketCode === "spreads").map(b => b.Line), [-2.5, -1.5]);
assert.deepEqual(picked.filter(b => b.MarketCode === "totals").map(b => b.Line), [0.5, 2.5, 3.5]);

console.log("sport_football_markets.smoke: ok");
