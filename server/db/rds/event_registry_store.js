/**
 * C 档：match_events + event_bindings 真相表读写（与 client_matches 双写物化）。
 */

import { getPgPool } from "./common.js";

function gbTeamIdForDb(value) {
  if (value == null || value === "")
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {Array<{
 *   id: number,
 *   title?: string,
 *   game?: string,
 *   game_id?: string,
 *   start_time?: number,
 *   bo?: number,
 *   pairing_tier?: string,
 *   pairing_confidence?: number,
 *   event_anchor?: string,
 *   home_gb_team_id?: number|string,
 *   away_gb_team_id?: number|string,
 *   built_at?: number,
 * }>} rows
 */
export async function upsertMatchEvents(rows) {
  const list = (rows || []).filter(r => Number.isFinite(Number(r?.id)));
  if (!list.length)
    return { updated: 0 };

  const pool = getPgPool();
  if (!pool)
    return { updated: 0, skipped: true };

  const now = Date.now();
  const sql = `
    INSERT INTO match_events (
      id, title, game, game_id, start_time, bo,
      pairing_tier, pairing_confidence, event_anchor,
      home_gb_team_id, away_gb_team_id, built_at, updated_at
    )
    SELECT * FROM unnest(
      $1::bigint[], $2::text[], $3::text[], $4::text[], $5::bigint[], $6::integer[],
      $7::text[], $8::real[], $9::text[],
      $10::bigint[], $11::bigint[], $12::bigint[], $13::bigint[]
    ) AS t(
      id, title, game, game_id, start_time, bo,
      pairing_tier, pairing_confidence, event_anchor,
      home_gb_team_id, away_gb_team_id, built_at, updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      game = EXCLUDED.game,
      game_id = EXCLUDED.game_id,
      start_time = EXCLUDED.start_time,
      bo = EXCLUDED.bo,
      pairing_tier = CASE
        WHEN match_events.pairing_tier_locked THEN match_events.pairing_tier
        ELSE EXCLUDED.pairing_tier
      END,
      pairing_confidence = CASE
        WHEN match_events.pairing_tier_locked THEN match_events.pairing_confidence
        ELSE EXCLUDED.pairing_confidence
      END,
      event_anchor = COALESCE(EXCLUDED.event_anchor, match_events.event_anchor),
      home_gb_team_id = COALESCE(EXCLUDED.home_gb_team_id, match_events.home_gb_team_id),
      away_gb_team_id = COALESCE(EXCLUDED.away_gb_team_id, match_events.away_gb_team_id),
      built_at = EXCLUDED.built_at,
      updated_at = EXCLUDED.updated_at
  `;

  const res = await pool.query(sql, [
    list.map(r => Number(r.id)),
    list.map(r => String(r.title || "")),
    list.map(r => (r.game != null ? String(r.game) : null)),
    list.map(r => (r.game_id != null ? String(r.game_id) : null)),
    list.map(r => (r.start_time != null ? Number(r.start_time) : null)),
    list.map(r => (r.bo != null ? Number(r.bo) : 0)),
    list.map(r => (r.pairing_tier != null ? String(r.pairing_tier) : null)),
    list.map(r => (r.pairing_confidence != null ? Number(r.pairing_confidence) : null)),
    list.map(r => (r.event_anchor != null ? String(r.event_anchor) : null)),
    list.map(r => gbTeamIdForDb(r.home_gb_team_id)),
    list.map(r => gbTeamIdForDb(r.away_gb_team_id)),
    list.map(r => Number(r.built_at) || now),
    list.map(() => now),
  ]);

  return { updated: res.rowCount ?? 0 };
}

/**
 * @param {Array<{
 *   platform: string,
 *   source_match_id: string,
 *   event_id: number,
 *   binding_confidence?: number,
 *   binding_source?: string,
 *   binding_side_mode?: string,
 *   bound_at?: number,
 * }>} bindings
 * @param {{ force?: boolean }} [opts] force=true 时覆盖 manual 绑定（运维 API）
 */
export async function upsertEventBindings(bindings, opts = {}) {
  const force = opts.force === true;
  const rows = (bindings || []).filter(
    b => b?.platform && b?.source_match_id && Number.isFinite(Number(b.event_id)),
  );
  if (!rows.length)
    return { updated: 0 };

  const pool = getPgPool();
  if (!pool)
    return { updated: 0, skipped: true };

  const now = Date.now();
  const conflictWhere = force
    ? ""
    : `WHERE eb.binding_source IS NULL
      OR eb.binding_source IN ('legacy', 'auto_name', 'align', 'auto_id')
      OR eb.event_id = EXCLUDED.event_id`;
  const sql = `
    INSERT INTO event_bindings AS eb (
      platform, source_match_id, event_id,
      binding_confidence, binding_source, binding_side_mode, bound_at
    )
    SELECT * FROM unnest(
      $1::text[], $2::text[], $3::bigint[], $4::real[],
      $5::text[], $6::text[], $7::bigint[]
    ) AS t(
      platform, source_match_id, event_id,
      binding_confidence, binding_source, binding_side_mode, bound_at
    )
    ON CONFLICT (platform, source_match_id) DO UPDATE SET
      event_id = EXCLUDED.event_id,
      binding_confidence = EXCLUDED.binding_confidence,
      binding_source = EXCLUDED.binding_source,
      binding_side_mode = EXCLUDED.binding_side_mode,
      bound_at = EXCLUDED.bound_at
    ${conflictWhere}
  `;

  const res = await pool.query(sql, [
    rows.map(r => String(r.platform)),
    rows.map(r => String(r.source_match_id)),
    rows.map(r => Number(r.event_id)),
    rows.map(r => Number(r.binding_confidence) || 0),
    rows.map(r => String(r.binding_source || "auto_name")),
    rows.map(r => (r.binding_side_mode ? String(r.binding_side_mode) : null)),
    rows.map(r => Number(r.bound_at) || now),
  ]);

  return { updated: res.rowCount ?? 0 };
}

export async function deleteMatchEvents(ids) {
  return archiveAndDeleteMatchEvents(ids);
}

export async function archiveAndDeleteMatchEvents(ids) {
  const list = (ids || []).map(Number).filter(Number.isFinite);
  if (!list.length)
    return { deleted: 0, archived: 0 };

  const pool = getPgPool();
  if (!pool)
    return { deleted: 0, archived: 0, skipped: true };

  const now = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO event_bindings_history (
         platform, source_match_id, event_id,
         binding_confidence, binding_source, binding_side_mode, bound_at, archived_at
       )
       SELECT platform, source_match_id, event_id,
              binding_confidence, binding_source, binding_side_mode, bound_at, $2
       FROM event_bindings
       WHERE event_id = ANY($1::bigint[])`,
      [list, now],
    );

    await client.query(
      `INSERT INTO match_events_history (
         id, title, game, game_id, start_time, bo,
         pairing_tier, pairing_confidence, event_anchor,
         home_gb_team_id, away_gb_team_id, built_at, updated_at, archived_at
       )
       SELECT
         id, title, game, game_id, start_time, bo,
         pairing_tier, pairing_confidence, event_anchor,
         home_gb_team_id, away_gb_team_id, built_at, updated_at, $2::bigint
       FROM match_events
       WHERE id = ANY($1::bigint[])`,
      [list, now],
    );

    const res = await client.query(
      "DELETE FROM match_events WHERE id = ANY($1::bigint[])",
      [list],
    );

    await client.query("COMMIT");
    return { deleted: res.rowCount ?? 0, archived: list.length };
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

/**
 * 以 event_bindings 为准回写 platform_matches.match_id 与 binding_*。
 */
export async function reconcilePlatformMatchesFromRegistry() {
  const pool = getPgPool();
  if (!pool)
    return { updated: 0, skipped: true };

  const res = await pool.query(`
    UPDATE platform_matches AS pm SET
      match_id = eb.event_id,
      binding_confidence = eb.binding_confidence,
      binding_source = eb.binding_source,
      binding_side_mode = eb.binding_side_mode,
      bound_at = eb.bound_at
    FROM event_bindings eb
    WHERE pm.platform = eb.platform
      AND pm.source_match_id = eb.source_match_id
      AND (
        pm.match_id IS DISTINCT FROM eb.event_id
        OR pm.binding_confidence IS DISTINCT FROM eb.binding_confidence
        OR pm.binding_source IS DISTINCT FROM eb.binding_source
        OR pm.binding_side_mode IS DISTINCT FROM eb.binding_side_mode
      )
  `);

  return { updated: res.rowCount ?? 0 };
}

/** 清理 platform_matches 已不存在的绑定行 */
export async function pruneOrphanEventBindings() {
  const pool = getPgPool();
  if (!pool)
    return { deleted: 0, skipped: true };

  const res = await pool.query(`
    DELETE FROM event_bindings eb
    WHERE NOT EXISTS (
      SELECT 1 FROM platform_matches pm
      WHERE pm.platform = eb.platform
        AND pm.source_match_id = eb.source_match_id
    )
  `);

  return { deleted: res.rowCount ?? 0 };
}

export async function fetchEventBindingsForEvents(eventIds) {
  const list = (eventIds || []).map(Number).filter(Number.isFinite);
  if (!list.length)
    return [];

  const pool = getPgPool();
  if (!pool)
    return [];

  const { rows } = await pool.query(
    `SELECT platform, source_match_id, event_id,
            binding_confidence, binding_source, binding_side_mode, bound_at
     FROM event_bindings
     WHERE event_id = ANY($1::bigint[])`,
    [list],
  );
  return rows;
}

export async function fetchEventBindingRow(platform, sourceMatchId) {
  const pool = getPgPool();
  if (!pool)
    return null;

  const { rows } = await pool.query(
    `SELECT platform, source_match_id, event_id,
            binding_confidence, binding_source, binding_side_mode, bound_at
     FROM event_bindings
     WHERE platform = $1 AND source_match_id = $2`,
    [String(platform), String(sourceMatchId)],
  );
  return rows[0] || null;
}

export async function fetchMatchEventRow(eventId) {
  const id = Number(eventId);
  if (!Number.isFinite(id))
    return null;

  const pool = getPgPool();
  if (!pool)
    return null;

  const { rows } = await pool.query(
    "SELECT * FROM match_events WHERE id = $1",
    [id],
  );
  return rows[0] || null;
}

/**
 * @param {{ force?: boolean }} [opts] 运维 API 可 force 删除任意来源绑定
 */
export async function deleteEventBinding(platform, sourceMatchId, opts = {}) {
  const force = opts.force === true;
  const pool = getPgPool();
  if (!pool)
    return { deleted: 0, skipped: true };

  const sql = force
    ? `DELETE FROM event_bindings WHERE platform = $1 AND source_match_id = $2`
    : `DELETE FROM event_bindings
       WHERE platform = $1 AND source_match_id = $2 AND binding_source = 'manual'`;

  const res = await pool.query(sql, [String(platform), String(sourceMatchId)]);
  return { deleted: res.rowCount ?? 0 };
}

export async function fetchAllEventBindings() {
  const pool = getPgPool();
  if (!pool)
    return [];

  const { rows } = await pool.query(
    `SELECT platform, source_match_id, event_id,
            binding_confidence, binding_source, binding_side_mode, bound_at
     FROM event_bindings`,
  );
  return rows;
}

export async function fetchEventRegistryStats() {
  const pool = getPgPool();
  if (!pool)
    return null;

  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM match_events) AS events,
      (SELECT COUNT(*)::int FROM event_bindings) AS bindings,
      (SELECT COUNT(*)::int FROM match_events WHERE pairing_tier = 'verified') AS verified,
      (SELECT COUNT(*)::int FROM match_events WHERE pairing_tier = 'provisional') AS provisional
  `);
  const row = rows[0] || {};
  return {
    events: Number(row.events) || 0,
    bindings: Number(row.bindings) || 0,
    verified: Number(row.verified) || 0,
    provisional: Number(row.provisional) || 0,
  };
}

const VALID_PAIRING_TIERS = new Set(["verified", "provisional", "staging"]);

export async function fetchLockedMatchEventTiers() {
  const pool = getPgPool();
  if (!pool)
    return new Map();

  const { rows } = await pool.query(
    `SELECT id, pairing_tier, pairing_confidence
     FROM match_events
     WHERE pairing_tier_locked = true`,
  );

  const out = new Map();
  for (const row of rows) {
    out.set(Number(row.id), {
      tier: String(row.pairing_tier || ""),
      confidence: row.pairing_confidence != null ? Number(row.pairing_confidence) : null,
    });
  }
  return out;
}

/**
 * 运维设置赛事实体分层（可锁定，防止下轮 merge 自动降级）。
 */
export async function updateMatchEventPairingTier(eventId, { tier, confidence, lock = true }) {
  const id = Number(eventId);
  const tierNorm = String(tier || "").toLowerCase();
  if (!Number.isFinite(id))
    throw new Error("无效的 event id");
  if (!VALID_PAIRING_TIERS.has(tierNorm))
    throw new Error(`无效 pairing_tier: ${tier}`);

  const pool = getPgPool();
  if (!pool)
    return { updated: 0, skipped: true };

  const now = Date.now();
  const conf = Number(confidence);
  const pairingConfidence = Number.isFinite(conf) ? conf : (tierNorm === "verified" ? 1 : 0.8);

  const eventRes = await pool.query(
    `UPDATE match_events SET
      pairing_tier = $2,
      pairing_confidence = $3,
      pairing_tier_locked = $4,
      updated_at = $5
     WHERE id = $1`,
    [id, tierNorm, pairingConfidence, !!lock, now],
  );

  const cmRes = await pool.query(
    `UPDATE client_matches SET
      pairing_tier = $2,
      pairing_confidence = $3
     WHERE id = $1`,
    [id, tierNorm, pairingConfidence],
  );

  return {
    updated: (eventRes.rowCount ?? 0) + (cmRes.rowCount ?? 0),
    event_id: id,
    pairing_tier: tierNorm,
    pairing_confidence: pairingConfidence,
    locked: !!lock,
  };
}
