/**
 * Matcher 数据访问 — 读写均走 RDS（PostgreSQL）。
 */

import { getPgPool, jsonb } from "./common.js";

function pool() {
  return getPgPool();
}

async function rdsQuery(sql, params = []) {
  const p = pool();
  if (!p)
    throw new Error("RDS 未配置");
  return p.query(sql, params);
}

export function isMatcherStoreReady() {
  return !!pool();
}

export async function fetchClientMatchIdIndex() {
  const { rows } = await rdsQuery(
    "SELECT id, merge_key, matchs FROM client_matches",
  );
  return rows.map(r => ({
    id: Number(r.id),
    merge_key: r.merge_key,
    matchs: r.matchs || {},
  }));
}

export async function findClientMatchIdByMergeKey(mergeKey) {
  const key = String(mergeKey || "").trim();
  if (!key)
    return null;
  const { rows } = await rdsQuery(
    "SELECT id FROM client_matches WHERE merge_key = $1 LIMIT 1",
    [key],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function insertClientMatchStubRds(mergeKey, stub) {
  const builtAt = Date.now();
  try {
    const { rows } = await rdsQuery(
      `INSERT INTO client_matches (
        merge_key, title, game, game_id, start_time, bo, round, round_start, matchs, bets, built_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)
      RETURNING id`,
      [
        mergeKey,
        String(stub.title || ""),
        stub.game != null ? String(stub.game) : null,
        stub.game_id != null ? String(stub.game_id) : null,
        Number(stub.start_time) || 0,
        Number(stub.bo) || 0,
        Number(stub.round) || 0,
        Number(stub.round_start) || 0,
        jsonb(stub.matchs, {}),
        jsonb([], []),
        builtAt,
      ],
    );
    return Number(rows[0].id);
  }
  catch (err) {
    if (err.code === "23505") {
      const { rows } = await rdsQuery("SELECT id FROM client_matches WHERE merge_key = $1", [mergeKey]);
      if (!rows.length)
        throw err;
      return Number(rows[0].id);
    }
    throw err;
  }
}

export async function insertClientMatchStub(mergeKey, stub = {}) {
  const key = String(mergeKey || "").trim();
  if (!key)
    throw new Error("merge_key 不能为空");
  return insertClientMatchStubRds(key, stub);
}

export function getClientMatchIdAdapter() {
  return {
    fetchClientMatchIndex: fetchClientMatchIdIndex,
    insertClientMatchStub,
    findClientMatchIdByMergeKey,
  };
}

export async function fetchPlatformMatchRow(platform, sourceMatchId) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  if (!plat || !srcId)
    return null;
  const { rows } = await rdsQuery(
    `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, teams, match_id, synced_at
     FROM platform_matches WHERE platform = $1 AND source_match_id = $2`,
    [plat, srcId],
  );
  return rows[0] || null;
}

export async function fetchClientMatchRow(id, columns = "*") {
  const cmId = Number(id);
  if (!Number.isFinite(cmId))
    return null;
  const cols
    = columns === "*"
      ? "id, merge_key, title, game, game_id, start_time, bo, round, round_start, matchs, bets, built_at, home_gb_team_id, away_gb_team_id"
      : columns;
  const { rows } = await rdsQuery(`SELECT ${cols} FROM client_matches WHERE id = $1`, [cmId]);
  return rows[0] || null;
}

export async function fetchPlatformMatchesHomeAway() {
  const { rows } = await rdsQuery(
    "SELECT platform, source_match_id, home, away FROM platform_matches",
  );
  return rows;
}

export async function fetchPlatformMatchesDashboard() {
  const { rows } = await rdsQuery(
    `SELECT pm.platform, pm.source_match_id, pm.source_game_id, pm.start_time,
            pm.home, pm.home_id, pm.away, pm.away_id, pm.bo,
            CASE WHEN cm.id IS NULL THEN NULL ELSE pm.match_id END AS match_id,
            pm.synced_at, pm.teams
     FROM platform_matches pm
     LEFT JOIN client_matches cm ON cm.id = pm.match_id
     ORDER BY pm.start_time ASC NULLS LAST`,
  );
  return rows;
}

export async function fetchClientMatchesDashboard() {
  const { rows } = await rdsQuery(
    `SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at
     FROM client_matches
     ORDER BY start_time ASC NULLS LAST`,
  );
  return rows;
}

export async function setClientMatchPlatformReverse(id, platform, reversed) {
  const cmId = Number(id);
  const plat = String(platform || "").trim();
  if (!Number.isFinite(cmId) || cmId <= 0)
    throw new Error("无效的赛事 ID");
  if (!plat)
    throw new Error("平台不能为空");

  const cm = await fetchClientMatchRow(cmId, "id, matchs, reverse");
  if (!cm)
    throw new Error("赛事不存在");
  const matchs = cm.matchs && typeof cm.matchs === "object" ? cm.matchs : {};
  if (!Object.hasOwn(matchs, plat))
    throw new Error(`赛事 ${cmId} 未关联平台 ${plat}`);

  const reverseSet = new Set(Array.isArray(cm.reverse) ? cm.reverse.map(String) : []);
  if (reversed)
    reverseSet.add(plat);
  else
    reverseSet.delete(plat);

  const nextReverse = [...reverseSet].filter(p => Object.hasOwn(matchs, p));
  await rdsQuery(
    "UPDATE client_matches SET reverse = $2::jsonb WHERE id = $1",
    [cmId, jsonb(nextReverse, [])],
  );
  return { id: cmId, platform: plat, reversed: !!reversed, reverse: nextReverse };
}

/** client_match_id → { platform → force_aligned | force_reversed } */
export async function fetchClientMatchPlatformOverrides() {
  const { rows } = await rdsQuery(
    `SELECT client_match_id, platform, mode
     FROM client_match_platform_overrides`,
  );
  const byClient = {};
  for (const r of rows || []) {
    const cmId = Number(r.client_match_id);
    if (!Number.isFinite(cmId) || cmId <= 0)
      continue;
    if (!byClient[cmId])
      byClient[cmId] = {};
    byClient[cmId][String(r.platform)] = String(r.mode);
  }
  return byClient;
}

/**
 * @param {'force_aligned'|'force_reversed'|null} mode null 删除覆盖，走 reconcile 自动判定
 */
export async function setClientMatchPlatformSideOverride(clientMatchId, platform, mode) {
  const cmId = Number(clientMatchId);
  const plat = String(platform || "").trim();
  if (!Number.isFinite(cmId) || cmId <= 0)
    throw new Error("无效的赛事 ID");
  if (!plat)
    throw new Error("平台不能为空");

  const cm = await fetchClientMatchRow(cmId, "id, matchs");
  if (!cm)
    throw new Error("赛事不存在");
  const matchs = cm.matchs && typeof cm.matchs === "object" ? cm.matchs : {};
  if (!Object.hasOwn(matchs, plat))
    throw new Error(`赛事 ${cmId} 未关联平台 ${plat}`);

  if (!mode) {
    await rdsQuery(
      `DELETE FROM client_match_platform_overrides
       WHERE client_match_id = $1 AND platform = $2`,
      [cmId, plat],
    );
    return { id: cmId, platform: plat, mode: null };
  }

  const normalized = String(mode);
  if (normalized !== "force_aligned" && normalized !== "force_reversed")
    throw new Error("mode 须为 force_aligned 或 force_reversed");

  await rdsQuery(
    `INSERT INTO client_match_platform_overrides (client_match_id, platform, mode)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_match_id, platform)
     DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()`,
    [cmId, plat, normalized],
  );
  return { id: cmId, platform: plat, mode: normalized };
}

export async function fetchClientMatchesHidden() {
  const { rows } = await rdsQuery(
    `SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, built_at
     FROM client_matches_history
     ORDER BY archived_at DESC NULLS LAST
     LIMIT 100`,
  );
  return rows;
}

export async function fetchClientMatchesHiddenCount() {
  const { rows } = await rdsQuery(
    `SELECT COUNT(*)::int AS count
     FROM client_matches_history`,
  );
  return rows[0]?.count ?? 0;
}

export async function fetchLatestClientMatchBuiltAt() {
  const { rows } = await rdsQuery(
    `SELECT built_at FROM client_matches
     ORDER BY built_at DESC NULLS LAST LIMIT 1`,
  );
  return rows[0]?.built_at ? Number(rows[0].built_at) : 0;
}

export async function archiveClientMatch(id) {
  const cmId = Number(id);
  if (!Number.isFinite(cmId))
    throw new Error("无效的赛事 ID");
  const { rowCount } = await rdsQuery(
    `WITH moved AS (
       DELETE FROM client_matches WHERE id = $1
       RETURNING *
     )
     INSERT INTO client_matches_history (id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, pm_sport)
     SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, pm_sport FROM moved`,
    [cmId],
  );
  if (!rowCount)
    throw new Error("赛事不存在");
  return { id: cmId, archived: true };
}

export async function fetchPlatformMatchesDebugRows() {
  const { rows } = await rdsQuery(
    "SELECT platform, source_match_id, start_time, home, away, synced_at FROM platform_matches",
  );
  return rows;
}

export async function fetchPlatformMatchesByClientMatchId(cmId) {
  const id = Number(cmId);
  const { rows } = await rdsQuery(
    "SELECT platform, source_match_id FROM platform_matches WHERE match_id = $1",
    [id],
  );
  return rows;
}

/** matchMerge 物化：platform_matches.match_id → client_matches.matchs（RDS 为准） */
export async function fetchAllPlatformMatchBindings() {
  const { rows } = await rdsQuery(
    "SELECT match_id, platform, source_match_id FROM platform_matches WHERE match_id IS NOT NULL",
  );
  const byClientId = new Map();
  for (const r of rows) {
    const cmId = Number(r.match_id);
    if (!Number.isFinite(cmId))
      continue;
    if (!byClientId.has(cmId))
      byClientId.set(cmId, []);
    byClientId.get(cmId).push({
      platform: String(r.platform),
      source_match_id: String(r.source_match_id),
    });
  }
  return byClientId;
}

export async function reassignPlatformMatchIds(fromId, toId) {
  const from = Number(fromId);
  const to = Number(toId);
  await rdsQuery("UPDATE platform_matches SET match_id = $1 WHERE match_id = $2", [to, from]);
}

export async function deletePlatformMatchRow(platform, sourceMatchId) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  await rdsQuery(
    `WITH moved AS (
       DELETE FROM platform_matches WHERE platform = $1 AND source_match_id = $2
       RETURNING *
     )
     INSERT INTO platform_matches_history (platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id)
     SELECT platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id FROM moved`,
    [plat, srcId],
  );
}

export async function deleteClientMatchRow(id) {
  const cmId = Number(id);
  await rdsQuery("DELETE FROM client_matches WHERE id = $1", [cmId]);
}
