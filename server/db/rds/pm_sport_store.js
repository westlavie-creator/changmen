/**
 * Polymarket Sports WS → client_matches.pm_sport
 */

import { getPgPool } from "../pg_pool.js";

const PM_PLATFORM = "Polymarket";

/** @returns {Promise<number | null>} client_matches.id */
export async function resolveClientMatchIdForPmSport({ slug, gameId, eventId }) {
  const pool = getPgPool();
  if (!pool)
    return null;

  const keys = new Set();
  if (slug)
    keys.add(String(slug));
  if (eventId)
    keys.add(String(eventId));
  if (gameId != null && eventId)
    keys.add(String(eventId));
  if (!keys.size)
    return null;

  const { rows } = await pool.query(
    `SELECT match_id
     FROM platform_matches
     WHERE platform = $1
       AND match_id IS NOT NULL
       AND source_match_id = ANY($2::text[])
     ORDER BY synced_at DESC
     LIMIT 1`,
    [PM_PLATFORM, [...keys]],
  );
  const matchId = rows[0]?.match_id;
  return matchId != null ? Number(matchId) : null;
}

/** @param {number} clientMatchId @param {object} pmSport */
export async function updateClientMatchPmSport(clientMatchId, pmSport) {
  const pool = getPgPool();
  if (!pool)
    return false;
  const id = Number(clientMatchId);
  if (!Number.isFinite(id))
    return false;

  const { rowCount } = await pool.query(
    `UPDATE client_matches
     SET pm_sport = $2::jsonb
     WHERE id = $1`,
    [id, JSON.stringify(pmSport ?? {})],
  );
  return rowCount > 0;
}
