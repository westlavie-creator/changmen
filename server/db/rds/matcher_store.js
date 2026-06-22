/**
 * Matcher 数据访问 — 读写均走 RDS（PostgreSQL）。
 */

import { CLIENT_MATCH_LIST_DEFAULT, CLIENT_MATCH_LIST_HIDDEN } from "../client_match_list_status.js";
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
  // 含 list_status=-1：rebuild 须复用原 id，写入时再复活为可见
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
        merge_key, title, game, game_id, start_time, bo, round, round_start, matchs, bets, built_at, list_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)
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
        CLIENT_MATCH_LIST_DEFAULT,
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
      ? "id, merge_key, title, game, game_id, start_time, bo, round, round_start, matchs, bets, built_at, list_status"
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
    `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, match_id, synced_at, teams
     FROM platform_matches ORDER BY start_time ASC NULLS LAST`,
  );
  return rows;
}

export async function fetchClientMatchesDashboard() {
  const { rows } = await rdsQuery(
    `SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, list_status
     FROM client_matches
     WHERE list_status IS DISTINCT FROM $1
     ORDER BY start_time ASC NULLS LAST`,
    [CLIENT_MATCH_LIST_HIDDEN],
  );
  return rows;
}

export async function fetchClientMatchesHidden() {
  const { rows } = await rdsQuery(
    `SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, built_at, list_status
     FROM client_matches
     WHERE list_status = $1
     ORDER BY built_at DESC NULLS LAST`,
    [CLIENT_MATCH_LIST_HIDDEN],
  );
  return rows;
}

export async function fetchLatestClientMatchBuiltAt() {
  const { rows } = await rdsQuery(
    `SELECT built_at FROM client_matches
     WHERE list_status IS DISTINCT FROM $1
     ORDER BY built_at DESC NULLS LAST LIMIT 1`,
    [CLIENT_MATCH_LIST_HIDDEN],
  );
  return rows[0]?.built_at ? Number(rows[0].built_at) : 0;
}

export async function setClientMatchListStatus(id, listStatus) {
  const cmId = Number(id);
  const status = Number(listStatus);
  if (!Number.isFinite(cmId))
    throw new Error("无效的赛事 ID");
  if (!Number.isFinite(status))
    throw new Error("无效的 list_status");
  const builtAt = Date.now();
  const { rowCount } = await rdsQuery(
    "UPDATE client_matches SET list_status = $2, built_at = $3 WHERE id = $1",
    [cmId, status, builtAt],
  );
  if (!rowCount)
    throw new Error("赛事不存在");
  return { id: cmId, list_status: status, built_at: builtAt };
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

export async function reassignPlatformMatchIds(fromId, toId) {
  const from = Number(fromId);
  const to = Number(toId);
  await rdsQuery("UPDATE platform_matches SET match_id = $1 WHERE match_id = $2", [to, from]);
}

export async function deletePlatformMatchRow(platform, sourceMatchId) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  await rdsQuery(
    "UPDATE platform_matches SET list_status = -1 WHERE platform = $1 AND source_match_id = $2 AND list_status IS DISTINCT FROM -1",
    [plat, srcId],
  );
}

export async function deleteClientMatchRow(id) {
  const cmId = Number(id);
  await rdsQuery("DELETE FROM client_matches WHERE id = $1", [cmId]);
}
