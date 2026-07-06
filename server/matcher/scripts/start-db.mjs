/**
 * 按 CHANGMEN_DB_SCRIPT 启动 matcher 循环进程（兼容 GAMEBET_DB_SCRIPT）。
 */
import { loadChangmenEnv } from "@changmen/storage/load_env.js";

loadChangmenEnv({ prepend: ["server/matcher/.env"] });
process.env.DATABASE_APPLICATION_NAME ||= "changmen-matcher";

const {
  DB_SCRIPT_MODES,
  resolveDbScript,
  initDatabaseUrl,
} = await import("@changmen/db");

const raw = String(process.env.CHANGMEN_DB_SCRIPT || process.env.GAMEBET_DB_SCRIPT || "rds").trim().toLowerCase();
const script = resolveDbScript();
if (!DB_SCRIPT_MODES.includes(raw) && raw !== script) {
  console.warn(`[matcher start-db] 未知 CHANGMEN_DB_SCRIPT=${raw}，使用 ${script}`);
}
process.env.CHANGMEN_DB_SCRIPT = script;

console.log(`[matcher start-db] CHANGMEN_DB_SCRIPT=${script}`);

await initDatabaseUrl();

await import("../matcher.js");
