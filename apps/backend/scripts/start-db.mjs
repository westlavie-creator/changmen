/**
 * 按 GAMEBET_DB_SCRIPT 启动后端（仅 rds）。
 */
import "@changmen/db/load_env.js";
import {
  DB_SCRIPT_MODES,
  resolveDbScript,
  initDatabaseUrl,
} from "@changmen/db";

const raw = String(process.env.GAMEBET_DB_SCRIPT || "rds").trim().toLowerCase();
const script = resolveDbScript();
if (!DB_SCRIPT_MODES.includes(raw) && raw !== script) {
  console.warn(`[start-db] 未知 GAMEBET_DB_SCRIPT=${raw}，使用 ${script}`);
}
process.env.GAMEBET_DB_SCRIPT = script;

console.log(`[start-db] GAMEBET_DB_SCRIPT=${script}`);

await initDatabaseUrl();

await import("../server.js");
