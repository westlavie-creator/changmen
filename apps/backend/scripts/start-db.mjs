/**
 * 按 GAMEBET_DB_SCRIPT 启动后端（supabase | rds | dual）。
 * .env 中设置 GAMEBET_DB_SCRIPT，或使用 start-supabase.mjs / start-rds.mjs / start-dual.mjs。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { DB_SCRIPT_MODES, resolveDbScript } from "../../../packages/shared/db/db_mode.js";
import { initDatabaseUrl } from "../../../packages/shared/db/resolve_database_url.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const envPath = path.join(backendRoot, ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const raw = String(process.env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
const script = resolveDbScript();
if (!DB_SCRIPT_MODES.includes(raw) && raw !== script) {
  console.warn(`[start-db] 未知 GAMEBET_DB_SCRIPT=${raw}，使用 ${script}`);
}
process.env.GAMEBET_DB_SCRIPT = script;

console.log(`[start-db] GAMEBET_DB_SCRIPT=${script}`);

await initDatabaseUrl();

await import("../server.js");
