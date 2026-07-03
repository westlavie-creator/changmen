#!/usr/bin/env node
/**
 * 部署前备份 profiles.accounts（防 deploy 误覆盖）。
 *
 *   node scripts/backup-profiles-accounts.mjs
 *   node scripts/backup-profiles-accounts.mjs --out storage/backups/accounts-pre-deploy.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady, getPgPool } from "@changmen/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const outArg = process.argv.find((a, i) => process.argv[i - 1] === "--out");
const outPath = outArg
  || join(backendRoot, "storage", "backups", `profiles-accounts-${Date.now()}.json`);

loadChangmenEnv();
await ensurePgPoolReady();
const pool = getPgPool();

const { rows } = await pool.query(
  `SELECT u.user_name, p.id, p.accounts, p.updated_at
   FROM profiles p JOIN users u ON u.id = p.id
   ORDER BY u.user_name`,
);

const { rows: playerStats } = await pool.query(
  `SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND owner_user_id IS NULL) AS active_no_owner
   FROM players`,
);

const payload = {
  backedUpAt: new Date().toISOString(),
  playerStats: playerStats[0],
  profiles: rows.map(r => ({
    userName: r.user_name,
    id: r.id,
    updatedAt: r.updated_at,
    accountCount: Array.isArray(r.accounts) ? r.accounts.length : 0,
    accounts: r.accounts,
  })),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`[backup] wrote ${outPath} (${rows.length} profiles)`);
if ((playerStats[0]?.active_no_owner ?? 0) > 0) {
  console.warn(`[backup] WARN: ${playerStats[0].active_no_owner} active players without owner_user_id`);
  process.exit(1);
}
