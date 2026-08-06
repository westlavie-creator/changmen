/**
 * Static isolation audit: football changes must not touch esport GetMatchs path.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const store = fs.readFileSync(path.join(root, "server/backend/core/esport-api/store.js"), "utf8");
const buildStart = store.indexOf("export async function buildMatchList");
const buildEnd = store.indexOf("export async function buildBaseballMatchList");
assert.ok(buildStart >= 0 && buildEnd > buildStart);
const buildMatchList = store.slice(buildStart, buildEnd);
assert.equal(/sport_merge|sport_gamma|football_gamma|sport_predictfun|sport_football|MarketCode|lineMarkets/.test(buildMatchList), false);
assert.match(buildMatchList, /loadClientMatchesFromDb/);

const matchTs = fs.readFileSync(path.join(root, "packages/client-core/src/models/match.ts"), "utf8");
const gnStart = matchTs.indexOf("getBetName()");
const gnEnd = matchTs.indexOf("maxOdds(");
const gn = matchTs.slice(gnStart, gnEnd);
assert.match(gn, /if \(this\.marketCode\)/);
assert.equal(/round === 0 && this\.name/.test(gn), false, "must not leak platform Name on Map=0");
assert.match(gn, /if \(this\.round === 0\)\s+return "全场胜负"/);

const marketCatalog = fs.readFileSync(path.join(root, "packages/shared/catalog/market_catalog.json"), "utf8");
assert.match(marketCatalog, /"code": "match_winner"/);
assert.equal(/"code": "spreads"/.test(marketCatalog), false);

for (const rel of [
  "server/match",
  "server/collectors",
  "client/web/src/stores/matchStore.ts",
  "client/web/src/stores/oddsStore.ts",
  "client/web/src/stores/match/mainBetLoop.ts",
]) {
  // existence only — diff emptiness checked by caller; here ensure sport_football not imported
  const full = path.join(root, rel);
  if (!fs.existsSync(full))
    continue;
  if (fs.statSync(full).isFile()) {
    const src = fs.readFileSync(full, "utf8");
    assert.equal(/sport_football_markets|lineMarkets/.test(src), false, rel);
  }
}

console.log("esport_isolation_audit.smoke: ok");
