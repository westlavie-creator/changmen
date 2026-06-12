import assert from "node:assert/strict";

const m = await import("./market_catalog.mjs");

const winSamples = [
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
assert.ok(m.listMarkets().some((x) => x.code === "match_winner"));

console.log("market_catalog_smoke: ok");
