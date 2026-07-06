/**
 * PM2 生产进程清单（扁平 VPS 布局：DEPLOY_REPO = 应用根，无外层 Git 仓库）。
 *   pm2 start deploy/ecosystem.config.cjs
 * 整仓 git pull 已废弃；上海/香港均为 tarball 扁平部署。
 */
const path = require("node:path");

const APP_ROOT = path.join(__dirname, "..");

const apps = [
  {
    name: "changmen-web",
    cwd: path.join(APP_ROOT, "server/backend"),
    script: "scripts/start-db.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
      DATABASE_APPLICATION_NAME: "changmen-web",
      MATCHER_EMBEDDED: process.env.MATCHER_EMBEDDED || "1",
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
];

if (process.env.MATCHER_STANDALONE === "1") {
  apps.push({
    name: "changmen-matcher",
    cwd: path.join(APP_ROOT, "server/matcher"),
    script: "scripts/start-db.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
      DATABASE_APPLICATION_NAME: "changmen-matcher",
      MATCHER_EMBEDDED: "0",
    },
  });
}

module.exports = { apps };
