/**
 * sport_list_cache 路径隔离冒烟（不碰 client_matches / DB）
 * 用法：node server/backend/core/esport-api/sport_list_cache.smoke.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  readSportListCache,
  sportListCachePath,
  writeSportListCache,
} from "./sport_list_cache.js";

const mlbPath = sportListCachePath("mlb");
const soccerPath = sportListCachePath("soccer");

assert.ok(mlbPath.includes(`${path.sep}sport${path.sep}mlb${path.sep}`), mlbPath);
assert.ok(soccerPath.includes(`${path.sep}sport${path.sep}soccer${path.sep}`), soccerPath);
assert.ok(!mlbPath.includes("client_matches"), mlbPath);
assert.ok(!mlbPath.includes(`${path.sep}legacy${path.sep}esport`), mlbPath);

assert.throws(() => sportListCachePath("../mlb"), /invalid|refused|escaped/);
assert.throws(() => sportListCachePath("client_matches"), /invalid|refused/);
assert.throws(() => sportListCachePath("esport"), /invalid|refused/);

const probeKey = "smoketest";
const probePath = sportListCachePath(probeKey);
const probeRows = [{ ID: 1, Game: "smoke", Title: "smoke" }];
writeSportListCache(probeKey, probeRows, Date.now());
const snap = readSportListCache(probeKey);
assert.ok(snap);
assert.equal(snap.rows[0].Title, "smoke");
assert.ok(fs.existsSync(probePath));
fs.rmSync(path.dirname(probePath), { recursive: true, force: true });

console.log("sport_list_cache.smoke: ok", { mlbPath });
