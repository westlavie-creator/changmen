/**
 * VPS：Polymarket 电竞 HTTP 采集 → platform_* + MarketIndex
 * 浏览器仅 Index → Market WS → fo；POLYMARKET_COLLECTOR_WRITE_PLATFORM=0 可改 shadow
 */

import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import {
  getResolvedDatabaseLabel,
  hasDatabaseUrlConfig,
  initDatabaseUrl,
} from "@changmen/db";

import { runPolymarketEsportsDiscoveryCycle } from "./loop.js";

loadChangmenEnv();

const DISCOVERY_MS = Number(process.env.POLYMARKET_COLLECTOR_INTERVAL_MS || 60_000);
let stopped = false;

async function tick() {
  try {
    const stats = await runPolymarketEsportsDiscoveryCycle();
    if (stats.skipped) {
      console.warn(
        `[polymarket-esports] cycle skipped reason=${stats.reason} `
        + `rawMarkets=${stats.rawMarketCount}`,
      );
      return;
    }
    const mode = stats.writePlatform ? "live" : "shadow";
    console.log(
      `[polymarket-esports] cycle ok mode=${mode} matches=${stats.matches} bets=${stats.bets}`
      + (stats.truncated ? " truncated=1" : "")
      + (stats.cleared ? " cleared=1" : "")
      + (stats.shadow ? " (shadow; platform write off)" : " (live; browser uses MarketIndex)")
      + (stats.collectTypes ? ` types=${stats.collectTypes.join(",")}` : ""),
    );
  }
  catch (err) {
    console.warn("[polymarket-esports] cycle error:", err.message);
  }
}

async function main() {
  if (!hasDatabaseUrlConfig()) {
    console.error("[polymarket-esports] DATABASE_URL / DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL 未配置");
    process.exit(1);
  }
  await initDatabaseUrl();
  console.log(`[polymarket-esports] RDS ${getResolvedDatabaseLabel() || "DATABASE_URL"}`);

  await tick();
  const timer = setInterval(() => {
    if (!stopped)
      void tick();
  }, DISCOVERY_MS);

  const shutdown = () => {
    stopped = true;
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[polymarket-esports] fatal:", err);
  process.exit(1);
});
