/**
 * 在创建数据库客户端之前加载 changmen .env。
 * 默认读 server/backend/.env；matcher 可 prepend server/matcher/.env。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findChangmenRoot } = require("./changmen_root.cjs");

const changmenRoot = findChangmenRoot(path.dirname(fileURLToPath(import.meta.url)));

function hasDatabaseUrl() {
  return !!(
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  );
}

/** @param {{ prepend?: string[] }} [options] */
export function loadChangmenEnv(options = {}) {
  const rels = [...(options.prepend ?? []), "server/backend/.env"];
  for (const rel of rels) {
    const envPath = path.join(changmenRoot, rel);
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    if (hasDatabaseUrl()) break;
  }
}
