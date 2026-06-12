import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const cjs = require("./market_catalog.js");
const esm = await import("./market_catalog.mjs");

const samples = [
  "单局-获胜",
  "地图1-手枪局-获胜",
  "[地图1]-获胜",
  "全局-获胜",
  "地图1+地图2",
  "",
];

for (const name of samples) {
  assert.equal(
    esm.obLegacyWinBetName(name),
    cjs.obLegacyWinBetName(name),
    `obLegacyWinBetName("${name}")`,
  );
}

const obTypesCjs = cjs.getObGameOddTypesByPlatformGameId();
const obTypesEsm = esm.getObGameOddTypesByPlatformGameId();
assert.deepEqual(obTypesEsm, obTypesCjs, "getObGameOddTypesByPlatformGameId");

assert.equal(
  esm.getDefaultMarketCode(),
  cjs.getDefaultMarketCode(),
  "getDefaultMarketCode",
);

const bet = { platform: "OB", betName: "单局-获胜", gameCode: "cs2", round: 1 };
assert.equal(
  esm.matchesSavedBet(bet),
  cjs.matchesSavedBet(bet),
  "matchesSavedBet OB map round",
);

console.log("market_catalog_parity: ok");
