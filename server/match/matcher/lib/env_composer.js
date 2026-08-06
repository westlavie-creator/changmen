/**
 * 合场（composer）侧的环境变量加载。
 *
 * 与 env.js 的差别是刻意保留的：这里优先 server/backend/.env，且只加载第一个
 * 存在的文件；env.js 优先包内 .env，并会在拿不到 DATABASE_URL 时继续叠加下一个。
 * 合并两者会改变 dev/运维脚本读到的配置来源，属行为变更，不在目录重构范围内。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const candidates = [
  path.join(root, "server/backend/.env"),
  path.join(root, "server/match/matcher/.env"),
  path.join(root, ".env"),
];
for (const p of candidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}
