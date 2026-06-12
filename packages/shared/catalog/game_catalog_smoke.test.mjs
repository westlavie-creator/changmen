import assert from "node:assert/strict";

const g = await import("./game_catalog.mjs");

assert.equal(g.getGameCodeForPlatformId("IA", "3"), "cs2");
assert.deepEqual(g.resolveClientGame("IA", "3"), { Game: "CS:GO", GameID: 3 });
assert.equal(g.getGameCodeForPlatformId("RAY", "140"), "cs2");
assert.ok(g.getActivePlatformGameIds("OB").length > 0);

console.log("game_catalog_smoke: ok");
