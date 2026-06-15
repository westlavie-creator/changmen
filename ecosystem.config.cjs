/**
 * PM2 生产进程清单（在 changmen/ 目录执行）：
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *
 * 进程名与 VPS 现有习惯一致：gamebet-web、gamebet-matcher
 */
module.exports = {
  apps: [
    {
      name: "gamebet-web",
      cwd: "./server/backend",
      script: "scripts/start-db.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "gamebet-matcher",
      cwd: "./server/matcher",
      script: "scripts/start-db.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
