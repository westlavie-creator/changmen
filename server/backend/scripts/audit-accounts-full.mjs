#!/usr/bin/env node
/** Full account system audit — profiles, players ownership, cross-user leaks, credentials. */
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady, getPgPool } from "@changmen/db";

loadChangmenEnv();
const pool = await ensurePgPoolReady();

function aid(a) {
  return Number(a?.accountId ?? a?.AccountId) || 0;
}

const { rows: profiles } = await pool.query(
  `SELECT u.user_name, u.is_admin, p.id, p.accounts, p.updated_at
   FROM profiles p JOIN users u ON u.id = p.id
   ORDER BY u.user_name`,
);

console.log("=== PROFILES ===");
/** @type {Map<number, string[]>} */
const playerToUsers = new Map();
for (const row of profiles) {
  const accs = row.accounts || [];
  console.log(`\n${row.user_name}${row.is_admin ? " [admin]" : ""} accounts=${accs.length} updated=${row.updated_at}`);
  for (const a of accs) {
    const id = aid(a);
    if (!playerToUsers.has(id))
      playerToUsers.set(id, []);
    playerToUsers.get(id).push(row.user_name);
    const tok = !!(a.token || a.Token || a.cookie || a.Cookie);
    console.log(
      `  ${id}\t${a.provider ?? a.Type ?? "?"}\t${a.platformName ?? a.PlatformName}\t${a.playerName ?? a.PlayerName}\tcred=${tok}`,
    );
  }
}

console.log("\n=== CROSS-USER PLAYER IDS (same accountId in multiple profiles) ===");
let cross = 0;
for (const [pid, users] of playerToUsers) {
  const uniq = [...new Set(users)];
  if (uniq.length > 1) {
    cross += 1;
    console.log(`  playerId ${pid} -> ${uniq.join(", ")}`);
  }
}
if (!cross)
  console.log("  (none)");

const { rows: ownerStats } = await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND owner_user_id IS NULL) AS active_no_owner,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND owner_user_id IS NOT NULL) AS active_with_owner
  FROM players
`);
console.log("\n=== PLAYERS ===", ownerStats[0]);

const { rows: noOwnerActive } = await pool.query(`
  SELECT id, platform_name, player_name
  FROM players WHERE deleted_at IS NULL AND owner_user_id IS NULL
  ORDER BY id
`);
if (noOwnerActive.length) {
  console.log("Active players without owner_user_id:");
  for (const p of noOwnerActive)
    console.log(`  ${p.id} ${p.platform_name}/${p.player_name}`);
}

const { rows: mismatches } = await pool.query(`
  SELECT u.user_name, (a.elem->>'accountId')::bigint AS account_id, p.owner_user_id, prof.id AS profile_user_id
  FROM profiles prof
  JOIN users u ON u.id = prof.id
  CROSS JOIN LATERAL jsonb_array_elements(prof.accounts) AS a(elem)
  LEFT JOIN players p ON p.id = (a.elem->>'accountId')::bigint AND p.deleted_at IS NULL
  WHERE p.owner_user_id IS NOT NULL AND p.owner_user_id <> prof.id
`);
console.log("\n=== OWNER_USER_ID MISMATCH (account in profile but player owned by another user) ===");
if (!mismatches.length)
  console.log("  (none)");
else
  for (const m of mismatches)
    console.log(`  ${m.user_name} has accountId ${m.account_id} but player owned by ${m.owner_user_id}`);

const { rows: dupPm } = await pool.query(`
  SELECT u.user_name, COUNT(*) AS pm_count
  FROM profiles prof
  JOIN users u ON u.id = prof.id
  CROSS JOIN LATERAL jsonb_array_elements(prof.accounts) AS a(elem)
  WHERE LOWER(COALESCE(a.elem->>'provider', a.elem->>'Type', '')) LIKE '%polymarket%'
     OR LOWER(COALESCE(a.elem->>'platformName', a.elem->>'PlatformName', '')) IN ('pm', 'polymarket')
  GROUP BY u.user_name
  HAVING COUNT(*) > 1
`);
console.log("\n=== USERS WITH >1 POLYMARKET ACCOUNT ===");
if (!dupPm.length)
  console.log("  (none)");
else
  for (const d of dupPm)
    console.log(`  ${d.user_name}: ${d.pm_count} PM accounts`);

await pool.end();
