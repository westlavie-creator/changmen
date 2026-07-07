/**
 * PM2 生产进程清单（扁平 VPS 布局：DEPLOY_REPO = 应用根，无外层 Git 仓库）。
 *   pm2 start deploy/ecosystem.config.cjs
 * 整仓 git pull 已废弃；上海/香港均为 tarball 扁平部署。
 */
const path = require("node:path");

const APP_ROOT = path.join(__dirname, "..");

/** 默认独立 matcher 进程，避免 matchMerge 与 HTTP 抢同进程 CPU */
const MATCHER_STANDALONE = process.env.MATCHER_STANDALONE !== "0";
const MATCHER_EMBEDDED = MATCHER_STANDALONE
  ? "0"
  : (process.env.MATCHER_EMBEDDED || "1");

const apps = [
  {
    name: "changmen-web",
    cwd: path.join(APP_ROOT, "server/backend"),
    script: "scripts/start-db.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
      DATABASE_APPLICATION_NAME: "changmen-web",
      MATCHER_EMBEDDED,
      MATCHER_STANDALONE: MATCHER_STANDALONE ? "1" : "0",
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

if (MATCHER_STANDALONE) {
  apps.push({
    name: "changmen-matcher",
    cwd: path.join(APP_ROOT, "server/matcher"),
    script: "scripts/start-db.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
      DATABASE_APPLICATION_NAME: "changmen-matcher",
      MATCHER_EMBEDDED: "0",
      MATCHER_STANDALONE: "1",
    },
  });
}

module.exports = { apps };
