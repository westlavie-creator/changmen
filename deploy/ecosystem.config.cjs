/**
 * PM2 生产进程清单（扁平 VPS 布局：DEPLOY_REPO = 应用根，无外层 Git 仓库）。
 *   pm2 start deploy/ecosystem.config.cjs --only changmen-esport,changmen-pm-sports,changmen-polymarket-collector,changmen-predictfun-collector,changmen-sxbet-collector,changmen-pm-market-hub,changmen-pm-sport-market-hub,changmen-predictfun-market-hub,changmen-sxbet-market-hub
 * 整仓 git pull 已废弃；上海/香港均为 tarball 扁平部署。
 *
 * changmen-predictfun-collector：PF REST 采集；默认随 deploy 与 PM collector 同启。
 * changmen-sxbet-collector：SX.bet REST 采集；默认随 deploy 与 PM/PF collector 同启。
 * changmen-polymarket-collector：电竞 PM Gamma discovery；默认随 deploy 启动。
 * changmen-pm-market-hub：PM-MARKET WS hub（电竞独立进程，避免扇出拖死 esport）。
 * changmen-pm-sport-market-hub：PM-SPORT-MARKET WS hub（体育独立进程/上游，与电竞隔离）。
 * changmen-predictfun-market-hub：PREDICTFUN-MARKET WS hub（独立进程，同理）。
 * changmen-sxbet-market-hub：SXBET-MARKET WS hub（Centrifugo best_odds，一把 SXBET_API_KEY）。
 * 写 platform_* + MarketIndex；浏览器仅 Index → WS → fo（已切流，无浏览器 Save*）。
 * 关写库设 POLYMARKET_COLLECTOR_WRITE_PLATFORM=0。
 *
 * 冻结：changmen-esport 保持单实例（勿 instances/cluster）。memory-first + platforms.json
 * 不可多进程共享；见 PRODUCTION_DEPLOYMENT.md §2.1 / docs/DATA_STORAGE.md。
 *
 * 合场唯一写路径由 changmen-esport 内嵌 matchMergeOnce→composeOnce。
 * 勿把独立 composer WRITE 循环（server/match/matcher 的 compose:*）加进本清单，
 * 会与内嵌 composer 双写 client_matches。
 */
const path = require("node:path");

const APP_ROOT = path.join(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "changmen-esport",
      cwd: path.join(APP_ROOT, "server/backend"),
      script: "scripts/start-db.mjs",
      interpreter: "node",
      max_memory_restart: "2048M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-esport",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
        PM_MARKET_HUB_PORT: "3457",
      },
    },
    {
      name: "changmen-pm-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "pm_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "1024M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-pm-market-hub",
        PM_MARKET_HUB_PORT: "3457",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
        // 套利跟手：合批从 100ms 降到 20ms；若 Health soft/age 抬头再调回 50
        PM_HUB_PENDING_FLUSH_MS: "20",
      },
    },
    {
      name: "changmen-pm-sport-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "pm_sport_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "1024M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-pm-sport-market-hub",
        PM_SPORT_MARKET_HUB_PORT: "3459",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
      },
    },
    {
      name: "changmen-predictfun-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "predictfun_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "1024M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-predictfun-market-hub",
        PREDICTFUN_MARKET_HUB_PORT: "3458",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
      },
    },
    {
      name: "changmen-sxbet-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "sxbet_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-sxbet-market-hub",
        SXBET_MARKET_HUB_PORT: "3460",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
      },
    },
    {
      name: "changmen-pm-sports",
      cwd: path.join(APP_ROOT, "server/collectors/polymarket-sports"),
      script: "index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-pm-sports",
      },
    },
    {
      name: "changmen-polymarket-collector",
      cwd: path.join(APP_ROOT, "server/collectors/polymarket-esports"),
      script: "index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-polymarket-collector",
        POLYMARKET_COLLECTOR_WRITE_PLATFORM: "1",
      },
    },
    {
      name: "changmen-predictfun-collector",
      cwd: path.join(APP_ROOT, "server/collectors/predictfun-collector"),
      script: "index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-predictfun-collector",
        PREDICTFUN_COLLECTOR_INTERVAL_MS: "15000",
        // 未来窗 1h（进行中不设过去下限，见 predictCollectStartTimeAllowed）
        PREDICTFUN_COLLECTOR_FUTURE_MS: String(3600 * 1000),
      },
    },
    {
      name: "changmen-sxbet-collector",
      cwd: path.join(APP_ROOT, "server/collectors/sxbet-collector"),
      script: "index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-sxbet-collector",
        SXBET_COLLECTOR_INTERVAL_MS: "60000",
        // 电竞赛程：未来窗默认 7 天（见 api.js）
        SXBET_COLLECTOR_FUTURE_MS: String(7 * 24 * 3600 * 1000),
      },
    },
  ],
};
