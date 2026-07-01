/**
 * 配对元数据：platform_matches 绑定列批量回写。
 */

import { getPgPool } from "./common.js";

/**
 * @param {Array<{
 *   platform: string,
 *   source_match_id: string,
 *   match_id: number,
 *   binding_confidence?: number,
 *   binding_source?: string,
 *   binding_side_mode?: string,
 *   bound_at?: number,
 * }>} bindings
 */
export async function upsertPlatformBindings(bindings) {
  const rows = (bindings || []).filter(
    b => b?.platform && b?.source_match_id && Number.isFinite(Number(b.match_id)),
  );
  if (!rows.length)
    return { updated: 0 };

  const pool = getPgPool();
  if (!pool)
    return { updated: 0, skipped: true };

  const now = Date.now();
  const sql = `
    UPDATE platform_matches AS pm SET
      match_id = v.match_id,
      binding_confidence = v.binding_confidence,
      binding_source = v.binding_source,
      binding_side_mode = v.binding_side_mode,
      bound_at = v.bound_at
    FROM (
      SELECT * FROM unnest(
        $1::text[], $2::text[], $3::bigint[], $4::real[],
        $5::text[], $6::text[], $7::bigint[]
      ) AS t(
        platform, source_match_id, match_id,
        binding_confidence, binding_source, binding_side_mode, bound_at
      )
    ) AS v
    WHERE pm.platform = v.platform
      AND pm.source_match_id = v.source_match_id
      AND (
        pm.match_id IS NULL
        OR pm.match_id = v.match_id
        OR pm.binding_source IN ('legacy', 'auto_name', 'align', 'auto_id')
      )
  `;

  const res = await pool.query(sql, [
    rows.map(r => String(r.platform)),
    rows.map(r => String(r.source_match_id)),
    rows.map(r => Number(r.match_id)),
    rows.map(r => Number(r.binding_confidence) || 0),
    rows.map(r => String(r.binding_source || "auto_name")),
    rows.map(r => (r.binding_side_mode ? String(r.binding_side_mode) : null)),
    rows.map(r => Number(r.bound_at) || now),
  ]);

  return { updated: res.rowCount ?? 0 };
}
