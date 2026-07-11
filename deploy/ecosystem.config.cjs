/**
 * PM2 生产进程清单（扁平 VPS 布局：DEPLOY_REPO = 应用根，无外层 Git 仓库）。
 *   pm2 start deploy/ecosystem.config.cjs
 * 整仓 git pull 已废弃；上海/香港均为 tarball 扁平部署。
 *
 * 进程命名：changmen-esport（电竞）| changmen-football（足球只读）| changmen-pm-sports
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
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-esport",
      },
    },
    {
      name: "changmen-pm-sports",
      cwd: path.join(APP_ROOT, "server/polymarket-sports"),
      script: "index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        DATABASE_APPLICATION_NAME: "changmen-pm-sports",
      },
    },
    {
      name: "changmen-football",
      cwd: path.join(APP_ROOT, "server/football"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        FOOTBALL_PORT: "3457",
        DATABASE_APPLICATION_NAME: "changmen-football",
      },
    },
  ],
};
