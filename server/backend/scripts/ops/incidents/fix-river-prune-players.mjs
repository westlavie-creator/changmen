#!/usr/bin/env node
/**
 * River：只保留 PM47 / PB48 / RAY46，软删其余 owner=River 的活跃 player。
 * 根因：owner 迁移 clone + players 唯一真相后 GetData 会列出全部 owner 行。
 *
 *   node scripts/fix-river-prune-players.mjs [--dry-run]
 */
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady, getPgPool } from "@changmen/db";
import { loadAccountsForUser, loadProfileById } from "../core/db/store.js";

const dryRun = process.argv.includes("--dry-run");
const KEEP = new Set([46, 47, 48]);

loadChangmenEnv();
await ensurePgPoolReady();
const pool = getPgPool();

const { rows } = await pool.query(
  `SELECT p.id FROM profiles p JOIN users u ON u.id = p.id WHERE u.user_name ILIKE 'River'`,
);
const uid = rows[0]?.id;
if (!uid)
  throw new Error("River not found");

const { rows: active } = await pool.query(
  `SELECT id, platform_name, player_name, provider
   FROM players WHERE owner_user_id = $1::uuid AND deleted_at IS NULL ORDER BY id`,
  [uid],
);

const toDrop = active.filter(p => !KEEP.has(Number(p.id)));
console.log(`River active players: ${active.length}, keep ${KEEP.size}, drop ${toDrop.length}`);
for (const p of active) {
  const mark = KEEP.has(Number(p.id)) ? "KEEP" : "DROP";
  console.log(`  [${mark}] ${p.id}\t${p.provider || "?"}\t${p.platform_name}\t${p.player_name}`);
}

if (dryRun || toDrop.length === 0) {
  console.log(dryRun ? "[dry-run] no write" : "nothing to drop");
  await pool.end();
  process.exit(0);
}

const now = Date.now();
const dropIds = toDrop.map(p => Number(p.id));
await pool.query(
  `UPDATE players
   SET deleted_at = $1, delete_description = $2, updated_at = $1
   WHERE owner_user_id = $3::uuid AND deleted_at IS NULL AND id = ANY($4::bigint[])`,
  [now, "fix-river-prune: keep only 46/47/48", uid, dropIds],
);

await loadProfileById(uid);
await loadAccountsForUser(uid);
console.log("done — cache reloaded");
await pool.end();
