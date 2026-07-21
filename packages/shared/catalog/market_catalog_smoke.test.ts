import assert from "node:assert/strict";

const m = await import("./market_catalog.ts");

const winSamples: [string, boolean][] = [
  ["[地图1]-单局-获胜", true],
  ["[地图1]-第一手枪局获胜", false],
  ["[地图1]-获胜", false],
  ["[全场]-某某获胜", true],
  ["地图1+地图2", false],
  ["", false],
];

for (const [name, expected] of winSamples) {
  assert.equal(m.obLegacyWinBetName(name), expected, `obLegacyWinBetName("${name}")`);
}

const obTypes = m.getObGameOddTypesByPlatformGameId();
assert.ok(typeof obTypes === "object" && Object.keys(obTypes).length > 0);

assert.equal(m.getDefaultMarketCode(), "match_winner");
assert.ok(m.listMarkets().some(x => x.code === "match_winner"));

assert.equal(m.rayMatchesOddGroupId({ odds_group_id: "16847" }, m.getPlatformRules("RAY"), "cs2"), true);
assert.equal(m.rayMatchesOddGroupId({ odds_group_id: "999" }, m.getPlatformRules("RAY"), "cs2"), false);
assert.equal(m.rayMatchesOddGroupId({ odds_group_id: "16847" }, m.getPlatformRules("RAY"), "unknown"), null);
assert.equal(
  m.matchesMarketCode("RAY", "match_winner", {
    row: { group_name: "其它", odds_group_id: "18280", status: 1 },
    raw: { group_name: "其它", odds_group_id: "18280", status: 1 },
    gameCode: "lol",
  }),
  true,
);
assert.equal(
  m.matchesMarketCode("RAY", "match_winner", {
    row: { group_name: "获胜者", odds_group_id: "1", status: 1 },
    raw: { group_name: "获胜者", odds_group_id: "1", status: 1 },
  }),
  true,
);

console.log("market_catalog_smoke: ok");
