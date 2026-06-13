/**
 * 队伍表读写 — 受 GAMEBET_DB_SCRIPT 控制（supabase | rds | dual）。
 * canonical_teams / team_platform_maps 与 platform_matches 等同开关策略。
 */

import { normalizeTeam } from "../match-engine/index.js";
import { supabaseAdmin } from "./client.js";
import { getDbMode } from "./db_mode.js";
import { getPgPool } from "./pg_pool.js";

const { script, readsRds, writesRds, writesSupabase } = getDbMode();

function sbClient() {
  return supabaseAdmin;
}

async function sbLoadAll(table, select) {
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const PAGE = 1000;
  const result = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await sb.from(table).select(select).range(off, off + PAGE - 1);
    if (error) throw error;
    result.push(...(data || []));
    if ((data || []).length < PAGE) break;
  }
  return result;
}

async function rdsLoadAll(sql, mapRow) {
  const pool = getPgPool();
  if (!pool) throw new Error("DATABASE_URL 未配置");
  const PAGE = 1000;
  const result = [];
  for (let off = 0; ; off += PAGE) {
    const { rows } = await pool.query(`${sql} OFFSET $1 LIMIT $2`, [off, PAGE]);
    if (!rows.length) break;
    for (const row of rows) result.push(mapRow ? mapRow(row) : row);
    if (rows.length < PAGE) break;
  }
  return result;
}

export function getTeamDbScript() {
  return script;
}

export async function fetchAllCanonicalTeams() {
  if (readsRds) {
    return rdsLoadAll(
      "SELECT id, gb_team_id, game, name, acronym FROM canonical_teams ORDER BY id",
      (r) => ({
        id: r.id,
        gb_team_id: r.gb_team_id,
        game: r.game,
        name: r.name,
        acronym: r.acronym,
      }),
    );
  }
  return sbLoadAll("canonical_teams", "id, gb_team_id, game, name, acronym");
}

export async function fetchAllTeamPlatformMaps() {
  if (readsRds) {
    return rdsLoadAll(
      "SELECT canonical_id, platform, platform_id FROM team_platform_maps ORDER BY id",
      (r) => ({
        canonical_id: r.canonical_id,
        platform: r.platform,
        platform_id: r.platform_id,
      }),
    );
  }
  return sbLoadAll("team_platform_maps", "canonical_id, platform, platform_id");
}

/** @returns {Set<string>} platform:platform_id */
export async function fetchExistingTeamMapKeys(candidates) {
  const existing = new Set();
  const byPlatform = new Map();
  for (const row of candidates.values()) {
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []);
    byPlatform.get(row.platform).push(row.platform_id);
  }

  const BATCH = 200;
  for (const [platform, ids] of byPlatform) {
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      if (readsRds) {
        const pool = getPgPool();
        if (!pool) throw new Error("DATABASE_URL 未配置");
        const { rows } = await pool.query(
          "SELECT platform_id FROM team_platform_maps WHERE platform = $1 AND platform_id = ANY($2::text[])",
          [platform, batch],
        );
        for (const row of rows) existing.add(`${platform}:${row.platform_id}`);
      } else {
        const sb = sbClient();
        if (!sb) return existing;
        const { data, error } = await sb
          .from("team_platform_maps")
          .select("platform_id")
          .eq("platform", platform)
          .in("platform_id", batch);
        if (error) throw new Error(`查询 team_platform_maps 失败: ${error.message}`);
        for (const row of data || []) existing.add(`${platform}:${row.platform_id}`);
      }
    }
  }
  return existing;
}

function normalizePlatformIdStr(id) {
  if (id == null || id === "") return "";
  return String(id).trim();
}

function parseTeamsArrayRaw(teams) {
  if (Array.isArray(teams)) return teams;
  if (typeof teams === "string") {
    try {
      return JSON.parse(teams);
    } catch {
      return [];
    }
  }
  return [];
}

function collectNeededTeamIds(allMatches) {
  const byPlatform = new Map();
  const add = (platform, pid) => {
    const p = String(platform || "").trim();
    const id = normalizePlatformIdStr(pid);
    if (!p || !id) return;
    if (!byPlatform.has(p)) byPlatform.set(p, new Set());
    byPlatform.get(p).add(id);
  };
  for (const m of allMatches || []) {
    add(m.platform, m.home_id);
    add(m.platform, m.away_id);
    for (const t of parseTeamsArrayRaw(m.teams)) {
      add(m.platform, t.TeamID ?? t.team_id ?? t.teamId ?? t.id);
    }
  }
  return byPlatform;
}

function mergeTeamMapRow(teamMaps, row) {
  const updatedBy = row.canonical_updated_by ?? row.updated_by ?? null;
  const canonicalName = row.canonical_name ?? row.canonical_teams?.name ?? null;
  const entry = {
    canonical_id: row.canonical_id != null ? String(row.canonical_id) : null,
    canonical_name: canonicalName,
    updated_by: updatedBy,
    platform_name: row.platform_name,
    game: row.game,
    pending: row.canonical_id == null,
  };
  const pid = normalizePlatformIdStr(row.platform_id);
  if (!pid) return;
  const idKey = `${row.platform}:${pid}`;
  const prev = teamMaps[idKey];
  if (!prev || (entry.canonical_id != null && prev.canonical_id == null)) {
    teamMaps[idKey] = entry;
  }
}

export async function loadTeamMapsForMatcher(allMatches) {
  const teamMaps = {};
  const neededByPlatform = collectNeededTeamIds(allMatches);
  const BATCH = 200;

  for (const [platform, idSet] of neededByPlatform) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      if (readsRds) {
        const pool = getPgPool();
        if (!pool) throw new Error("DATABASE_URL 未配置");
        const { rows } = await pool.query(
          `SELECT tpm.platform, tpm.platform_id, tpm.platform_name, tpm.canonical_id, tpm.game,
                  ct.updated_by AS canonical_updated_by, ct.name AS canonical_name
           FROM team_platform_maps tpm
           LEFT JOIN canonical_teams ct ON ct.gb_team_id = tpm.canonical_id
           WHERE tpm.platform = $1 AND tpm.platform_id = ANY($2::text[])`,
          [platform, batch],
        );
        for (const row of rows) mergeTeamMapRow(teamMaps, row);
      } else {
        const sb = sbClient();
        if (!sb) return teamMaps;
        const { data, error } = await sb
          .from("team_platform_maps")
          .select(
            "platform, platform_id, platform_name, canonical_id, game, canonical_teams(updated_by, name)",
          )
          .eq("platform", platform)
          .in("platform_id", batch);
        if (error) throw new Error(`team_platform_maps 查询失败: ${error.message}`);
        for (const row of data || []) mergeTeamMapRow(teamMaps, row);
      }
    }
  }
  return teamMaps;
}

export async function fetchTeamPlatformMap(platform, platformId) {
  const plat = String(platform || "").trim();
  const pid = String(platformId || "").trim();
  if (!plat || !pid) return null;

  if (readsRds) {
    const pool = getPgPool();
    if (!pool) throw new Error("DATABASE_URL 未配置");
    const { rows } = await pool.query(
      "SELECT canonical_id, platform_name, game FROM team_platform_maps WHERE platform = $1 AND platform_id = $2 LIMIT 1",
      [plat, pid],
    );
    return rows[0] || null;
  }

  const sb = sbClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("team_platform_maps")
    .select("canonical_id, platform_name, game")
    .eq("platform", plat)
    .eq("platform_id", pid)
    .maybeSingle();
  if (error) throw new Error(`查询 team_platform_maps 失败: ${error.message}`);
  return data;
}

export async function countTeamMapsForGbId(gbTeamId) {
  const id = Number(gbTeamId);
  if (!Number.isFinite(id)) return 0;

  if (readsRds) {
    const pool = getPgPool();
    if (!pool) throw new Error("DATABASE_URL 未配置");
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS c FROM team_platform_maps WHERE canonical_id = $1",
      [id],
    );
    return rows[0]?.c || 0;
  }

  const sb = sbClient();
  if (!sb) return 0;
  const { count, error } = await sb
    .from("team_platform_maps")
    .select("platform", { count: "exact", head: true })
    .eq("canonical_id", id);
  if (error) throw new Error(`统计 gb_team_id 映射失败: ${error.message}`);
  return count || 0;
}

async function sbUpsertTeamPlatformMaps(chunk, { ignoreDuplicates = false } = {}) {
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const opts = { onConflict: "platform,platform_id" };
  if (ignoreDuplicates) opts.ignoreDuplicates = true;
  const { error } = await sb.from("team_platform_maps").upsert(chunk, opts);
  if (error) throw error;
}

async function rdsUpsertTeamPlatformMaps(chunk, { ignoreDuplicates = false } = {}) {
  const pool = getPgPool();
  if (!pool) throw new Error("DATABASE_URL 未配置");
  for (const row of chunk) {
    const sql = ignoreDuplicates
      ? `INSERT INTO team_platform_maps (canonical_id, platform, platform_id, platform_name, game, source, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (platform, platform_id) DO NOTHING`
      : `INSERT INTO team_platform_maps (canonical_id, platform, platform_id, platform_name, game, source, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (platform, platform_id) DO UPDATE SET
           canonical_id = EXCLUDED.canonical_id,
           platform_name = EXCLUDED.platform_name,
           game = EXCLUDED.game,
           source = EXCLUDED.source,
           confidence = EXCLUDED.confidence`;
    await pool.query(sql, [
      row.canonical_id ?? null,
      row.platform,
      String(row.platform_id),
      row.platform_name,
      row.game ?? null,
      row.source ?? "manual",
      row.confidence ?? 1.0,
    ]);
  }
}

export async function upsertTeamPlatformMaps(rows, opts = {}) {
  if (!rows?.length) return;
  const chunk = rows.map((r) => ({
    canonical_id: r.canonical_id ?? null,
    platform: String(r.platform),
    platform_id: String(r.platform_id),
    platform_name: String(r.platform_name || r.platform_id),
    game: r.game ?? null,
    source: r.source ?? "manual",
    confidence: r.confidence ?? 1.0,
  }));

  if (writesRds) await rdsUpsertTeamPlatformMaps(chunk, opts);
  if (writesSupabase) await sbUpsertTeamPlatformMaps(chunk, opts);
}

export async function upsertTeamPlatformMapsBatched(rows, batchSize = 200, opts = {}) {
  for (let i = 0; i < rows.length; i += batchSize) {
    await upsertTeamPlatformMaps(rows.slice(i, i + batchSize), opts);
  }
}

async function sbUpsertCanonicalTeams(chunk) {
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { error } = await sb.from("canonical_teams").upsert(chunk, { onConflict: "game,name" });
  if (error) throw error;
}

async function rdsUpsertCanonicalTeams(chunk) {
  const pool = getPgPool();
  if (!pool) throw new Error("DATABASE_URL 未配置");
  for (const row of chunk) {
    await pool.query(
      `INSERT INTO canonical_teams (game, name, acronym, pandascore_id, updated_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
       ON CONFLICT (game, name) DO UPDATE SET
         acronym = EXCLUDED.acronym,
         pandascore_id = EXCLUDED.pandascore_id,
         updated_at = EXCLUDED.updated_at`,
      [
        row.game,
        row.name,
        row.acronym ?? null,
        row.pandascore_id ?? null,
        row.updated_at ?? null,
      ],
    );
  }
}

export async function upsertCanonicalTeams(rows) {
  if (!rows?.length) return;
  if (writesRds) await rdsUpsertCanonicalTeams(rows);
  if (writesSupabase) await sbUpsertCanonicalTeams(rows);
}

export async function nextManualGbTeamId() {
  if (readsRds) {
    const pool = getPgPool();
    if (!pool) throw new Error("DATABASE_URL 未配置");
    const { rows } = await pool.query("SELECT next_manual_gb_team_id() AS id");
    return Number(rows[0]?.id);
  }
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { data, error } = await sb.rpc("next_manual_gb_team_id");
  if (error) throw new Error(`分配手动 gb_team_id 失败: ${error.message}`);
  return Number(data);
}

export async function fetchCanonicalTeamExact(gameCode, name) {
  if (readsRds) {
    const pool = getPgPool();
    if (!pool) throw new Error("DATABASE_URL 未配置");
    const { rows } = await pool.query(
      "SELECT id, gb_team_id, name FROM canonical_teams WHERE game = $1 AND name = $2 LIMIT 1",
      [gameCode, name],
    );
    return rows[0] || null;
  }
  const sb = sbClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("canonical_teams")
    .select("id, gb_team_id, name")
    .eq("game", gameCode)
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(`查询 canonical 队伍失败: ${error.message}`);
  return data;
}

export async function findCanonicalTeamByNormalizedName(gameCode, norm) {
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let data;
    if (readsRds) {
      const pool = getPgPool();
      if (!pool) throw new Error("DATABASE_URL 未配置");
      const { rows } = await pool.query(
        "SELECT id, gb_team_id, name FROM canonical_teams WHERE game = $1 ORDER BY id OFFSET $2 LIMIT $3",
        [gameCode, from, pageSize],
      );
      data = rows;
    } else {
      const sb = sbClient();
      if (!sb) return null;
      const res = await sb
        .from("canonical_teams")
        .select("id, gb_team_id, name")
        .eq("game", gameCode)
        .range(from, from + pageSize - 1);
      if (res.error) throw new Error(`查询 canonical 队伍失败: ${res.error.message}`);
      data = res.data;
    }
    if (!data?.length) return null;
    for (const row of data) {
      if (normalizeTeam(row.name) === norm) return row;
    }
    if (data.length < pageSize) return null;
  }
}

async function rdsUpdateCanonicalTeamById(rowId, patch) {
  const pool = getPgPool();
  if (!pool) throw new Error("DATABASE_URL 未配置");
  const sets = [];
  const vals = [];
  let n = 1;
  if (patch.gb_team_id != null) {
    sets.push(`gb_team_id = $${n++}`);
    vals.push(patch.gb_team_id);
  }
  if (patch.updated_by != null) {
    sets.push(`updated_by = $${n++}`);
    vals.push(patch.updated_by);
  }
  if (!sets.length) return null;
  vals.push(rowId);
  const { rows } = await pool.query(
    `UPDATE canonical_teams SET ${sets.join(", ")} WHERE id = $${n} RETURNING gb_team_id, name, game`,
    vals,
  );
  return rows[0] || null;
}

async function sbUpdateCanonicalTeamById(rowId, patch) {
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { data, error } = await sb
    .from("canonical_teams")
    .update(patch)
    .eq("id", rowId)
    .select("gb_team_id, name, game")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCanonicalTeamById(id, patch) {
  const rowId = Number(id);
  if (!Number.isFinite(rowId)) throw new Error("canonical id 无效");

  if (writesRds) {
    const data = await rdsUpdateCanonicalTeamById(rowId, patch);
    if (writesSupabase) {
      try {
        await sbUpdateCanonicalTeamById(rowId, patch);
      } catch (e) {
        console.warn("[db] team_store dual: Supabase update canonical_teams:", e.message);
      }
    }
    return data;
  }
  if (writesSupabase) return sbUpdateCanonicalTeamById(rowId, patch);
  return null;
}

async function rdsInsertCanonicalTeam(row) {
  const pool = getPgPool();
  if (!pool) throw new Error("DATABASE_URL 未配置");
  const { rows } = await pool.query(
    `INSERT INTO canonical_teams (gb_team_id, game, name, updated_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, gb_team_id`,
    [row.gb_team_id, row.game, row.name, row.updated_by ?? null],
  );
  return rows[0];
}

async function sbInsertCanonicalTeam(row) {
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { data, error } = await sb.from("canonical_teams").insert(row).select("id, gb_team_id").single();
  if (error) throw error;
  return data;
}

export async function insertCanonicalTeam(row) {
  if (writesRds) {
    const data = await rdsInsertCanonicalTeam(row);
    if (writesSupabase) {
      try {
        await sbInsertCanonicalTeam(row);
      } catch (e) {
        console.warn("[db] team_store dual: Supabase insert canonical_teams:", e.message);
      }
    }
    return data;
  }
  if (writesSupabase) return sbInsertCanonicalTeam(row);
  throw new Error("未配置数据后端");
}

async function rdsReassignGbTeamId(from, to) {
  const pool = getPgPool();
  if (!pool) throw new Error("DATABASE_URL 未配置");
  const { rows } = await pool.query(
    `UPDATE team_platform_maps SET canonical_id = $1, source = 'manual'
     WHERE canonical_id = $2 RETURNING platform, platform_id`,
    [to, from],
  );
  return rows.length;
}

async function sbReassignGbTeamId(from, to) {
  const sb = sbClient();
  if (!sb) throw new Error("Supabase 未配置");
  const { data, error } = await sb
    .from("team_platform_maps")
    .update({ canonical_id: to, source: "manual" })
    .eq("canonical_id", from)
    .select("platform, platform_id");
  if (error) throw new Error(`改写 gb_team_id 映射失败: ${error.message}`);
  return (data || []).length;
}

export async function reassignGbTeamId(fromId, toId) {
  const from = Number(fromId);
  const to = Number(toId);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return 0;

  let count = 0;
  if (writesRds) count = await rdsReassignGbTeamId(from, to);
  if (writesSupabase) {
    const sbCount = await sbReassignGbTeamId(from, to);
    if (!_writesRds) count = sbCount;
  }
  return count;
}

/** fire-and-forget 单条映射（team-resolver saveMapping） */
export function saveTeamMappingFireAndForget(row) {
  upsertTeamPlatformMaps([row]).catch((e) =>
    console.warn("[team_store] saveMapping 失败:", e.message),
  );
}
