#!/usr/bin/env node
/** Remove duplicate Polymarket account 45 from River; keep 47 (primary PM). */
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady, getPgPool } from "@changmen/db";
import { loadProfileById } from "../../../core/db/store.js";

const dryRun = process.argv.includes("--dry-run");
const DROP_ID = 45;
const KEEP_PM_ID = 47;

loadChangmenEnv();
await ensurePgPoolReady();
const pool = getPgPool();

const { rows } = await pool.query(
  `SELECT p.id, p.accounts FROM profiles p JOIN users u ON u.id = p.id WHERE u.user_name ILIKE 'River'`,
);
const row = rows[0];
if (!row)
  throw new Error("River not found");

const before = row.accounts || [];
const after = before.filter(a => Number(a.accountId ?? a.AccountId) !== DROP_ID);
const hasKeep = after.some(a => Number(a.accountId ?? a.AccountId) === KEEP_PM_ID);

console.log(`River accounts: ${before.length} -> ${after.length} (drop ${DROP_ID}, keep PM ${KEEP_PM_ID})`);
for (const a of after) {
  console.log(`  ${a.accountId}\t${a.provider}\t${a.platformName}\t${a.playerName}`);
}
if (!hasKeep)
  console.warn(`WARN: PM ${KEEP_PM_ID} not in list after dedupe`);

if (!dryRun && after.length !== before.length) {
  await pool.query(
    `UPDATE profiles SET accounts = $2::jsonb, updated_at = $3 WHERE id = $1`,
    [row.id, JSON.stringify(after), Date.now()],
  );
  await loadProfileById(row.id);
  console.log("RDS updated + profile cache reloaded");
}
else if (dryRun) {
  console.log("[dry-run] no write");
}
