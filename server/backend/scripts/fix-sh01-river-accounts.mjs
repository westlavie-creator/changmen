#!/usr/bin/env node
/**
 * One-off: fix SH01 (empty) and River (PM45 + PB48 + RAY46) profiles.accounts
 * Usage: node scripts/fix-sh01-river-accounts.mjs [--dry-run]
 */
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { ensurePgPoolReady, getPgPool } from "@changmen/db";
import { loadProfileById, pullProfilesFromDb } from "../core/db/store.js";

const dryRun = process.argv.includes("--dry-run");
loadChangmenEnv();
await ensurePgPoolReady();
const pool = getPgPool();
await pullProfilesFromDb();

async function getUserId(userName) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE user_name ILIKE $1`,
    [userName],
  );
  return rows[0]?.id;
}

async function getProfileAccounts(userName) {
  const { rows } = await pool.query(
    `SELECT accounts FROM profiles p JOIN users u ON u.id = p.id WHERE u.user_name ILIKE $1`,
    [userName],
  );
  return rows[0]?.accounts ?? [];
}

function pickAccountFields(src) {
  if (!src)
    return null;
  return { ...src };
}

function minimalAccount({ accountId, provider, platformName, playerName, platformId }) {
  return {
    accountId,
    provider,
    platformName,
    playerName,
    platformId,
    pause: false,
    balance: undefined,
    updateTime: Date.now(),
    rateConfig: provider === "RAY" || provider === "PB"
      ? [{ rate: 0.2, maxOdds: 0, minOdds: 0 }]
      : [],
  };
}

async function fetchPlayer(playerId) {
  const { rows } = await pool.query(
    `SELECT id, platform_id, platform_name, player_name FROM players WHERE id = $1 AND deleted_at IS NULL`,
    [playerId],
  );
  return rows[0] ?? null;
}

function providerForPlatform(platformName) {
  const n = String(platformName || "").toLowerCase();
  if (n === "pm" || n.includes("polymarket"))
    return "Polymarket";
  if (n === "pb" || n.includes("平博"))
    return "PB";
  if (n === "ray" || n.includes("雷"))
    return "RAY";
  return "OB";
}

async function findAccountInAllProfiles(playerId) {
  const { rows } = await pool.query(`SELECT accounts FROM profiles`);
  for (const row of rows) {
    for (const a of row.accounts || []) {
      if (Number(a.accountId ?? a.AccountId) === playerId)
        return a;
    }
  }
  return null;
}

async function buildRiverAccounts(current) {
  const byId = new Map(
    (current || []).map(a => [Number(a.accountId ?? a.AccountId), a]),
  );
  const wantIds = [
    { id: 45, fallbackProvider: "Polymarket" },
    { id: 48, fallbackProvider: "PB" },
    { id: 46, fallbackProvider: "RAY" },
  ];
  const out = [];
  for (const { id, fallbackProvider } of wantIds) {
    const existing = byId.get(id) ?? await findAccountInAllProfiles(id);
    if (existing) {
      out.push(pickAccountFields(existing));
      continue;
    }
    const player = await fetchPlayer(id);
    if (!player) {
      console.warn(`player ${id} not found, skip`);
      continue;
    }
    out.push(minimalAccount({
      accountId: id,
      provider: fallbackProvider || providerForPlatform(player.platform_name),
      platformName: player.platform_name,
      playerName: player.player_name,
      platformId: Number(player.platform_id),
    }));
  }
  return out;
}

async function apply(userName, accounts) {
  const uid = await getUserId(userName);
  if (!uid)
    throw new Error(`user not found: ${userName}`);
  console.log(`${dryRun ? "[dry-run] " : ""}${userName}: set ${accounts.length} accounts`);
  for (const a of accounts) {
    console.log(
      `  ${a.accountId}\t${a.provider ?? a.Type}\t${a.platformName ?? a.PlatformName}\t${a.playerName ?? a.PlayerName}`,
    );
  }
  if (!dryRun) {
    const now = Date.now();
    await pool.query(
      `UPDATE profiles SET accounts = $2::jsonb, updated_at = $3 WHERE id = $1`,
      [uid, JSON.stringify(accounts), now],
    );
    await loadProfileById(uid);
  }
}

const riverCurrent = await getProfileAccounts("River");
const riverNext = await buildRiverAccounts(riverCurrent);
await apply("River", riverNext);

console.log("done");
