/**
 * 按 GAMEBET_DB_SCRIPT 启动后端（supabase | rds）。
 * .env 中设置 GAMEBET_DB_SCRIPT，或使用 start-supabase.mjs / start-rds.mjs。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const envPath = path.join(backendRoot, ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const raw = String(process.env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
const script = raw === "rds" ? "rds" : "supabase";
if (raw !== script) {
  console.warn(`[start-db] 未知 GAMEBET_DB_SCRIPT=${raw}，使用 supabase`);
}
process.env.GAMEBET_DB_SCRIPT = script;

console.log(`[start-db] GAMEBET_DB_SCRIPT=${script}`);

await import("../server.js");
