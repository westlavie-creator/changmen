import assert from "node:assert/strict";

const g = await import("./game_catalog.ts");

assert.equal(g.getGameCodeForPlatformId("IA", "3"), "cs2");
assert.deepEqual(g.resolveClientGame("IA", "3"), { Game: "CS:GO", GameID: 3 });
assert.equal(g.getGameCodeForPlatformId("TF", "14"), "kog");
assert.equal(g.getGameCodeForPlatformId("IA", "16"), "kog");
assert.equal(g.getGameCodeForPlatformId("RAY", "140"), "cs2");
assert.ok(g.getActivePlatformGameIds("OB").length > 0);

const pb = await import("./pb_team_platform_id.ts");
assert.equal(pb.formatPbTeamPlatformId("cs2", "navi"), "navi@cs2");
assert.equal(pb.formatPbTeamPlatformId("cs2", "navi@cs2"), "navi@cs2");
assert.equal(pb.formatPbTeamPlatformId("cs2", "cs2:navi"), "navi@cs2");
assert.equal(pb.formatPbTeamPlatformId("", "navi"), "navi");
assert.equal(pb.formatPbTeamPlatformId("", "ilbirs", "dota2"), "ilbirs@dota-2");
assert.equal(pb.formatPbTeamPlatformId("dota2", "ilbirs", "dota2"), "ilbirs@dota-2");
assert.equal(pb.resolvePlatformTeamId("OB", "navi", "cs2"), "navi");
assert.equal(pb.resolvePlatformTeamId("PB", "navi", "cs2"), "navi@cs2");
assert.equal(pb.resolvePlatformTeamId("PB", "navi", "cs2", "cs2"), "navi@cs2");

console.log("game_catalog_smoke: ok");
