/**
 * 在任何 Supabase 客户端创建之前加载 backend .env。
 * ESM 会先求值 import 链，入口里写在 module body 的 dotenv.config 来不及生效。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findChangmenRoot } = require("./changmen_root.cjs");

const changmenRoot = findChangmenRoot(path.dirname(fileURLToPath(import.meta.url)));

for (const rel of ["apps/backend/.env"]) {
  const envPath = path.join(changmenRoot, rel);
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath });
  if (
    process.env.SUPABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  ) {
    break;
  }
}
