#!/usr/bin/env node
/**
 * 将 VPS / 本机 storage/tag_platforms.json、players.json 合并导入 RDS。
 * 幂等，可重复执行（缺行补入，已有 id 以 JSON 覆盖余额等字段）。
 *
 *   cd changmen/server/backend
 *   npm run db:apply          # 首次需建表 006
 *   npm run db:migrate-players
 */

import { initDatabaseUrl, migratePlayersJsonToRds } from "@changmen/db";

await initDatabaseUrl();

const result = await migratePlayersJsonToRds();
console.log("[migrate-players]", JSON.stringify(result, null, 2));

if (!result.ok && !result.skipped) {
  process.exit(1);
}
