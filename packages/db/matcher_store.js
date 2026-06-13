/**
 * Matcher 数据访问 — 统一走 GAMEBET_DB_SCRIPT 读路径（RDS/dual 读 RDS），
 * 写路径按 dual/rds/supabase 双写或单写。不暴露 Supabase JS Client。
 */

import { getDbMode } from "./db_mode.js";
import { getPgPool } from "./pg_pool.js";
import { supabaseAdmin } from "./client.js";

function pool() {
  return getPgPool("matcher_store");
}

function useRdsRead() {
  const { readsRds } = getDbMode();
  return readsRds && pool();
}

async function rdsQuery(sql, params = []) {
  const p = pool();
  if (!p) throw new Error("RDS 未配置");
  return p.query(sql, params);
}

function jsonb(val, fallback) {
  if (val == null) return JSON.stringify(fallback ?? null);
  return JSON.stringify(val);
}

/** matcher UI / link / rebuild 是否具备读库能力 */
export function isMatcherStoreReady() {
  if (useRdsRead()) return true;
  return !!supabaseAdmin;
}

export async function fetchClientMatchIdIndex() {
  if (useRdsRead()) {
    const { rows } = await rdsQuery("SELECT id, merge_key, matchs FROM client_matches");
    return rows.map((r) => ({
      id: Number(r.id),
      merge_key: r.merge_key,
      matchs: r.matchs || {},
    }));
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin.from("client_matches").select("id, merge_key, matchs");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function findClientMatchIdByMergeKey(mergeKey) {
  const key = String(mergeKey || "").trim();
  if (!key) return null;
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      "SELECT id FROM client_matches WHERE merge_key = $1 LIMIT 1",
      [key],
    );
    return rows[0] ? Number(rows[0].id) : null;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("client_matches")
    .select("id")
    .eq("merge_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id != null ? Number(data.id) : null;
}

async function insertClientMatchStubSupabase(mergeKey, stub, explicitId) {
  if (!supabaseAdmin) throw new Error("Supabase 未配置");
  const row = {
    merge_key: mergeKey,
    title: String(stub.title || ""),
    game: String(stub.game || ""),
    game_id: String(stub.game_id || ""),
    start_time: Number(stub.start_time) || 0,
    bo: Number(stub.bo) || 0,
    round: Number(stub.round) || 0,
    round_start: Number(stub.round_start) || 0,
    matchs: stub.matchs || {},
    bets: [],
    built_at: Date.now(),
  };
  if (explicitId != null) row.id = explicitId;

  const { data, error } = await supabaseAdmin
    .from("client_matches")
    .insert(row)
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("client_matches")
      .select("id")
      .eq("merge_key", mergeKey)
      .single();
    if (dupErr) throw new Error(dupErr.message);
    return Number(dup.id);
  }
  if (error) throw new Error(error.message);
  return Number(data.id);
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
  } catch (err) {
    if (err.code === "23505") {
      const { rows } = await rdsQuery("SELECT id FROM client_matches WHERE merge_key = $1", [mergeKey]);
      if (!rows.length) throw err;
      return Number(rows[0].id);
    }
    throw err;
  }
}

export async function insertClientMatchStub(mergeKey, stub = {}) {
  const key = String(mergeKey || "").trim();
  if (!key) throw new Error("merge_key 不能为空");
  const { writesRds, writesSupabase } = getDbMode();

  let id = null;
  if (writesRds) {
    id = await insertClientMatchStubRds(key, stub);
  } else if (writesSupabase) {
    id = await insertClientMatchStubSupabase(key, stub);
  } else {
    throw new Error("数据库未配置");
  }

  if (writesRds && writesSupabase && supabaseAdmin) {
    try {
      await insertClientMatchStubSupabase(key, stub, id);
    } catch (err) {
      if (err.message && !String(err.message).includes("23505")) {
        console.warn("[matcher_store] dual 写入 Supabase stub 失败:", err.message);
      }
    }
  }
  return id;
}

/** match-engine resolveClientMatchIds / ensureClientMatchId 适配器 */
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
  if (!plat || !srcId) return null;

  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, teams, match_id, synced_at
       FROM platform_matches WHERE platform = $1 AND source_match_id = $2`,
      [plat, srcId],
    );
    return rows[0] || null;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("platform_matches")
    .select("*")
    .eq("platform", plat)
    .eq("source_match_id", srcId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchClientMatchRow(id, columns = "*") {
  const cmId = Number(id);
  if (!Number.isFinite(cmId)) return null;

  if (useRdsRead()) {
    const cols =
      columns === "*"
        ? "id, merge_key, title, game, game_id, start_time, bo, round, round_start, matchs, bets, built_at"
        : columns;
    const { rows } = await rdsQuery(`SELECT ${cols} FROM client_matches WHERE id = $1`, [cmId]);
    return rows[0] || null;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("client_matches")
    .select(columns)
    .eq("id", cmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPlatformMatchesHomeAway() {
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      "SELECT platform, source_match_id, home, away FROM platform_matches",
    );
    return rows;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("platform_matches")
    .select("platform, source_match_id, home, away");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPlatformMatchesDashboard() {
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, match_id, synced_at, teams
       FROM platform_matches ORDER BY start_time ASC NULLS LAST`,
    );
    return rows;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("platform_matches")
    .select(
      "platform,source_match_id,source_game_id,start_time,home,home_id,away,away_id,bo,match_id,synced_at,teams",
    )
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchClientMatchesDashboard() {
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      `SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, built_at
       FROM client_matches ORDER BY start_time ASC NULLS LAST`,
    );
    return rows;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("client_matches")
    .select("id,title,game,game_id,start_time,bo,round,matchs,bets,built_at")
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchLatestClientMatchBuiltAt() {
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      "SELECT built_at FROM client_matches ORDER BY built_at DESC NULLS LAST LIMIT 1",
    );
    return rows[0]?.built_at ? Number(rows[0].built_at) : 0;
  }
  if (!supabaseAdmin) return 0;
  const { data, error } = await supabaseAdmin
    .from("client_matches")
    .select("built_at")
    .order("built_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.built_at || 0;
}

export async function fetchPlatformMatchesDebugRows() {
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      "SELECT platform, source_match_id, start_time, home, away, synced_at FROM platform_matches",
    );
    return rows;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("platform_matches")
    .select("platform, source_match_id, start_time, home, away, synced_at");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPlatformMatchesByClientMatchId(cmId) {
  const id = Number(cmId);
  if (useRdsRead()) {
    const { rows } = await rdsQuery(
      "SELECT platform, source_match_id FROM platform_matches WHERE match_id = $1",
      [id],
    );
    return rows;
  }
  if (!supabaseAdmin) throw new Error("数据库未配置");
  const { data, error } = await supabaseAdmin
    .from("platform_matches")
    .select("platform, source_match_id")
    .eq("match_id", id);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updatePlatformMatchMatchId(platform, sourceMatchId, matchId) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  const cmId = Number(matchId);
  const { writesRds, writesSupabase } = getDbMode();

  if (writesRds) {
    await rdsQuery(
      "UPDATE platform_matches SET match_id = $1 WHERE platform = $2 AND source_match_id = $3",
      [cmId, plat, srcId],
    );
  }
  if (writesSupabase && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from("platform_matches")
      .update({ match_id: cmId })
      .eq("platform", plat)
      .eq("source_match_id", srcId);
    if (error) throw new Error(error.message);
  }
}

export async function reassignPlatformMatchIds(fromId, toId) {
  const from = Number(fromId);
  const to = Number(toId);
  const { writesRds, writesSupabase } = getDbMode();

  if (writesRds) {
    await rdsQuery("UPDATE platform_matches SET match_id = $1 WHERE match_id = $2", [to, from]);
  }
  if (writesSupabase && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from("platform_matches")
      .update({ match_id: to })
      .eq("match_id", from);
    if (error) throw new Error(error.message);
  }
}

export async function deletePlatformMatchRow(platform, sourceMatchId) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  const { writesRds, writesSupabase } = getDbMode();

  if (writesRds) {
    await rdsQuery(
      "DELETE FROM platform_matches WHERE platform = $1 AND source_match_id = $2",
      [plat, srcId],
    );
  }
  if (writesSupabase && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from("platform_matches")
      .delete()
      .eq("platform", plat)
      .eq("source_match_id", srcId);
    if (error) throw new Error(error.message);
  }
}

export async function deleteClientMatchRow(id) {
  const cmId = Number(id);
  const { writesRds, writesSupabase } = getDbMode();

  if (writesRds) {
    await rdsQuery("DELETE FROM client_matches WHERE id = $1", [cmId]);
  }
  if (writesSupabase && supabaseAdmin) {
    const { error } = await supabaseAdmin.from("client_matches").delete().eq("id", cmId);
    if (error) throw new Error(error.message);
  }
}
