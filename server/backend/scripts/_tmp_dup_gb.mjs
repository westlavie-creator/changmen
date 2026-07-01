#!/usr/bin/env node
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady } from "@changmen/db";
loadChangmenEnv();
const pool = await ensurePgPoolReady();

for (const q of ["FOKUS", "Misa", "MISA", "Mandatory"]) {
  const r = await pool.query(`
    SELECT gb_team_id, game, name, pandascore_id
    FROM canonical_teams
    WHERE name ILIKE $1 OR acronym ILIKE $1
    ORDER BY game, gb_team_id
  `, [`%${q}%`]);
  console.log(`\n=== canonical_teams like ${q} ===`);
  for (const row of r.rows) console.log(JSON.stringify(row));
}

const dup = await pool.query(`
  SELECT game, platform_name, COUNT(DISTINCT canonical_id) AS gb_count,
         array_agg(DISTINCT canonical_id) AS gb_ids
  FROM team_platform_maps
  WHERE canonical_id IS NOT NULL
  GROUP BY game, platform_name
  HAVING COUNT(DISTINCT canonical_id) > 1
  ORDER BY gb_count DESC, platform_name
  LIMIT 15
`);
console.log("\n=== platform_name -> multiple canonical_id (same game) ===");
for (const row of dup.rows) console.log(JSON.stringify(row));

await pool.end();
