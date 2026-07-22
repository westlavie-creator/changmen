/**
 * sport_team_plugin 冒烟（不读 RDS / 不碰电竞 team_db）。
 */
import assert from "node:assert/strict";
import {
  createSportTeamPlugin,
  resolveSportTeamKey,
  sportPairKeyResolved,
} from "./sport_team_plugin.js";

assert.equal(resolveSportTeamKey("Oakland Athletics", "mlb"), "athletics");
assert.equal(resolveSportTeamKey("A's", "mlb"), "athletics");
assert.equal(resolveSportTeamKey("Athletics", "mlb"), "athletics");

const t = 1_700_000_000_000;
assert.equal(
  sportPairKeyResolved("A's", "Yankees", t, "mlb"),
  sportPairKeyResolved("Oakland Athletics", "New York Yankees", t, "mlb"),
);
assert.notEqual(
  sportPairKeyResolved("Lions", "Twins", t, "mlb"),
  sportPairKeyResolved("Lions", "Twins", t, "kbo"),
);
assert.ok(String(sportPairKeyResolved("Lions", "Twins", t, "kbo") || "").startsWith("kbo|"));

const plugin = createSportTeamPlugin({ games: ["mlb"] });
assert.equal(plugin.resolveKey("Red Sox", "mlb"), "red sox");
assert.equal(
  plugin.pairKey("Boston Red Sox", "Yankees", t, "mlb"),
  plugin.pairKey("Red Sox", "NY Yankees", t, "mlb"),
);

console.log("sport_team_plugin.smoke: ok");
