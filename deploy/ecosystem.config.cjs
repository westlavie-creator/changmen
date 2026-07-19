/**
 * PM2 生产进程清单（扁平 VPS 布局：DEPLOY_REPO = 应用根，无外层 Git 仓库）。
 *   pm2 start deploy/ecosystem.config.cjs --only changmen-esport,changmen-pm-sports,changmen-polymarket-collector,changmen-predictfun-collector,changmen-pm-market-hub,changmen-predictfun-market-hub
 * 整仓 git pull 已废弃；上海/香港均为 tarball 扁平部署。
 *
 * changmen-predictfun-collector：PF REST 采集；默认随 deploy 与 PM collector 同启。
 * changmen-polymarket-collector：电竞 PM Gamma discovery；默认随 deploy 启动。
 * changmen-pm-market-hub：PM-MARKET WS hub（独立进程，避免扇出拖死 esport）。
 * changmen-predictfun-market-hub：PREDICTFUN-MARKET WS hub（独立进程，同理）。
 * 写 platform_* + MarketIndex；浏览器仅 Index → WS → fo（已切流，无浏览器 Save*）。
 * 关写库设 POLYMARKET_COLLECTOR_WRITE_PLATFORM=0。
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
        // [changmen 临时] PF 未来窗 12h；恢复 A8 1h 时删此行或改 3600000
        PREDICTFUN_COLLECTOR_FUTURE_MS: String(12 * 3600 * 1000),
      },
    },
  ],
};
