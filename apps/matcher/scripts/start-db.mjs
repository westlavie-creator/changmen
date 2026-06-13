/**
 * 按 GAMEBET_DB_SCRIPT 启动 matcher 循环进程。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  DB_SCRIPT_MODES,
  resolveDbScript,
  initDatabaseUrl,
} from "@changmen/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matcherRoot = path.join(__dirname, "..");

const envCandidates = [
  path.join(matcherRoot, ".env"),
  path.join(matcherRoot, "../backend/.env"),
];
for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath });
  if (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL ||
    process.env.SUPABASE_URL
  ) {
    break;
  }
}

const raw = String(process.env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
const script = resolveDbScript();
if (!DB_SCRIPT_MODES.includes(raw) && raw !== script) {
  console.warn(`[matcher start-db] 未知 GAMEBET_DB_SCRIPT=${raw}，使用 ${script}`);
}
process.env.GAMEBET_DB_SCRIPT = script;

console.log(`[matcher start-db] GAMEBET_DB_SCRIPT=${script}`);

await initDatabaseUrl();

await import("../matcher.js");
