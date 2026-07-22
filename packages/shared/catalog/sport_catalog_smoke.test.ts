import assert from "node:assert/strict";

const sport = await import("./sport_catalog.ts");
const gameCatalog = await import("./game_catalog.json", { with: { type: "json" } });

assert.equal(sport.DEFAULT_SPORT, "esport");
assert.equal(sport.listSports().length, 4);

const esport = sport.getSport("esport");
assert.ok(esport);
assert.equal(esport!.status, "active");
assert.deepEqual(esport!.defaultGameCodes, ["cs2", "lol", "dota2", "valorant", "kog"]);

const baseball = sport.getSport("baseball");
assert.ok(baseball);
assert.equal(baseball!.status, "active");
assert.deepEqual(baseball!.defaultGameCodes, ["mlb", "kbo", "npb"]);

const football = sport.getSport("football");
assert.ok(football);
assert.equal(football!.status, "active");
assert.deepEqual(football!.defaultGameCodes, ["soccer"]);

const tennis = sport.getSport("tennis");
assert.ok(tennis);
assert.equal(tennis!.status, "active");
assert.deepEqual(tennis!.defaultGameCodes, ["tennis"]);

assert.deepEqual(
  sport.listActiveSports().map(s => s.code).sort(),
  ["baseball", "esport", "football", "tennis"],
);

for (const game of gameCatalog.default.games) {
  const sportCode = game.sport ?? sport.DEFAULT_SPORT;
  assert.equal(sportCode, "esport", `${game.code} sport`);
  assert.ok(sport.isKnownSport(sportCode), `${game.code} → ${sportCode}`);
}

assert.equal(sport.getSportForGameCode("cs2"), "esport");
assert.equal(sport.getSportForGameCode("lol"), "esport");
assert.equal(sport.getSportForGameCode("unknown"), null);

const g = await import("./game_catalog.ts");
assert.equal(g.getGameSport("dota2"), "esport");
assert.equal(g.DEFAULT_GAME_SPORT, "esport");

console.log("sport_catalog_smoke: ok");
