/**
 * 166 仅 Market hub（勿在此机启动 changmen-esport / collector）。
 * 与 comagent 共存：Caddy 只给 ws2.changmen.fun 反代 :3457/:3458/:3459/:3460。
 */
const path = require("node:path");

const APP_ROOT = path.join(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "changmen-pm-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "pm_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "384M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-pm-market-hub-166",
        PM_MARKET_HUB_PORT: "3457",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
        PM_HUB_PENDING_FLUSH_MS: "20",
      },
    },
    {
      name: "changmen-pm-sport-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "pm_sport_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-pm-sport-market-hub-166",
        PM_SPORT_MARKET_HUB_PORT: "3459",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
      },
    },
    {
      name: "changmen-predictfun-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "predictfun_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-predictfun-market-hub-166",
        PREDICTFUN_MARKET_HUB_PORT: "3458",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
      },
    },
    {
      name: "changmen-sxbet-market-hub",
      cwd: path.join(APP_ROOT, "server/ws_forward"),
      script: "sxbet_market_hub_server.js",
      interpreter: "node",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-sxbet-market-hub-166",
        SXBET_MARKET_HUB_PORT: "3460",
        WS_FORWARD_MAX_BUFFERED_BYTES: "524288",
      },
    },
  ],
};
