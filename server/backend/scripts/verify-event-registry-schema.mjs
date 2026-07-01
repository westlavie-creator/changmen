/**
 * 快速检查 match_events / event_bindings 迁移是否就绪。
 */
import { initDatabaseUrl } from "@changmen/db";
import pg from "@changmen/db/pg.js";

await initDatabaseUrl();
if (!process.env.DATABASE_URL) {
  console.error("[verify] 缺少 DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const cols = await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'match_events'
     AND column_name IN ('pairing_tier_locked', 'pairing_tier', 'event_anchor')
   ORDER BY 1`,
);
const tables = await pool.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('match_events', 'event_bindings', 'match_events_history', 'event_bindings_history')
   ORDER BY 1`,
);
const counts = await pool.query(
  `SELECT
     (SELECT count(*)::int FROM match_events) AS events,
     (SELECT count(*)::int FROM event_bindings) AS bindings,
     (SELECT count(*)::int FROM client_matches) AS client_matches,
     (SELECT count(*)::int FROM match_events WHERE pairing_tier_locked = true) AS locked_events`,
);

console.log("[verify] tables:", tables.rows.map(r => r.table_name).join(", "));
console.log("[verify] match_events columns:", cols.rows.map(r => r.column_name).join(", "));
console.log("[verify] counts:", counts.rows[0]);
await pool.end();
