/**
 * PM2 生产进程清单（扁平 VPS 布局：DEPLOY_REPO = 应用根，无外层 Git 仓库）。
 *   pm2 start deploy/ecosystem.config.cjs --only changmen-esport,changmen-pm-sports,changmen-polymarket-collector
 * 整仓 git pull 已废弃；上海/香港均为 tarball 扁平部署。
 *
 * changmen-predictfun-collector：可选；默认 deploy 不启动（见 deploy-server-remote.sh）。
 * changmen-polymarket-collector：电竞 PM Gamma discovery；默认随 deploy 启动。
 * 暂时与浏览器 Save* 双写 platform_*；关写库设 POLYMARKET_COLLECTOR_WRITE_PLATFORM=0。
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
      },
    },
  ],
};
