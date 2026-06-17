/**
 * 在创建数据库客户端之前加载 changmen .env。
 * 默认读 server/backend/.env；matcher 可 prepend server/matcher/.env。
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { CHANGMEN_ROOT_FROM_DB_PKG } from "./changmen_root.js";

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
    const envPath = path.join(CHANGMEN_ROOT_FROM_DB_PKG, rel);
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    if (hasDatabaseUrl()) break;
  }
}
