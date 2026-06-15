/**
 * 在创建数据库客户端之前加载 backend .env。
 * ESM 会先求值 import 链，入口里写在 module body 的 dotenv.config 来不及生效。
 * 优先 server/backend/.env（档 B），兼容 apps/backend/.env。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findChangmenRoot } = require("./changmen_root.cjs");

const changmenRoot = findChangmenRoot(path.dirname(fileURLToPath(import.meta.url)));

for (const rel of ["server/backend/.env", "apps/backend/.env"]) {
  const envPath = path.join(changmenRoot, rel);
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath });
  if (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  ) {
    break;
  }
}
