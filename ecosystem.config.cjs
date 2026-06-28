/**
 * PM2 生产进程清单（在 changmen/ 目录执行）：
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *
 * 进程名与 VPS 现有习惯一致：gamebet-web、gamebet-matcher
 * 默认生产使用 gamebet-web 内嵌 matcher；需回滚独立 matcher 时：
 *   MATCHER_STANDALONE=1 MATCHER_EMBEDDED=0 pm2 start ecosystem.config.cjs
 */
const apps = [
  {
    name: "gamebet-web",
    cwd: "./server/backend",
    script: "scripts/start-db.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
      DATABASE_APPLICATION_NAME: "gamebet-web",
      MATCHER_EMBEDDED: process.env.MATCHER_EMBEDDED || "1",
    },
  },
];

if (process.env.MATCHER_STANDALONE === "1") {
  apps.push({
    name: "gamebet-matcher",
    cwd: "./server/matcher",
    script: "scripts/start-db.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
      DATABASE_APPLICATION_NAME: "gamebet-matcher",
      MATCHER_EMBEDDED: "0",
    },
  });
}

module.exports = { apps };
