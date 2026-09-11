/**
 * Gamma 冷拉取不得把过期磁盘缓存拖过前端 15s。
 * 用法：node server/backend/core/esport-api/sport_gamma_fetch.smoke.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { clearSportGammaCache, fetchSportAsClientMatchDtos } from "./sport_gamma_fetch.js";
import { clearSportListCache, sportListCachePath, writeSportListCache } from "./sport_list_cache.js";

const KEY = "swrsmoke";
const origFetch = globalThis.fetch;

function restore() {
  globalThis.fetch = origFetch;
  clearSportGammaCache(KEY);
  clearSportListCache(KEY);
  const dir = path.dirname(sportListCachePath(KEY));
  fs.rmSync(dir, { recursive: true, force: true });
}

writeSportListCache(KEY, [{
  ID: 800000001,
  Title: "SWR Home vs SWR Away",
  Game: "epl",
  StartTime: Date.now() + 3_600_000,
  Matchs: {},
  Bets: [],
}], Date.now() - 20 * 60_000);
clearSportGammaCache(KEY);

let hangReject;
globalThis.fetch = () => new Promise((_, reject) => {
  hangReject = reject;
});

try {
  const t0 = Date.now();
  const rows = await fetchSportAsClientMatchDtos({
    sportKey: "epl",
    gameCode: "epl",
    cacheKey: KEY,
    logTag: "swrsmoke",
    pastMs: 4 * 3600_000,
    futureMs: 6 * 3600_000,
  });
  const ms = Date.now() - t0;
  assert.ok(ms < 1000, `stale SWR too slow: ${ms}ms`);
  assert.equal(rows[0]?.Title, "SWR Home vs SWR Away");
  hangReject?.(new Error("stop hang"));
  console.log("sport_gamma_fetch.smoke: ok", { ms, n: rows.length });
}
finally {
  restore();
}
