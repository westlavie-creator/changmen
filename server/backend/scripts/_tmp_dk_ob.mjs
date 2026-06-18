import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const mid = "5616875187897430";
const pm = await pool.query(
  "SELECT * FROM platform_matches WHERE platform='OB' AND source_match_id=$1",
  [mid],
);
const pb = await pool.query(
  "SELECT map, bet_name, home_odds, away_odds, updated_at FROM platform_bets WHERE platform='OB' AND source_match_id=$1 ORDER BY map",
  [mid],
);
const cm = await pool.query(
  "SELECT id, title, matchs, bets FROM client_matches WHERE matchs->>'OB' = $1",
  [mid],
);
console.log("platform_match", pm.rows[0]);
console.log("platform_bets count", pb.rowCount, pb.rows);
if (cm.rows[0]) {
  const bets = cm.rows[0].bets || [];
  console.log("client_match id", cm.rows[0].id);
  if (Array.isArray(bets)) {
    for (const b of bets) {
      const src = b.Sources || {};
      console.log("bet map", b.Map, "sources", Object.keys(src), "OB?", !!src.OB);
    }
  }
}
await pool.end();
