/**
 * 采集路径 — platform_matches / platform_bets / live_timers（SaveMatch/SaveBet/SaveLiveTimer）。
 */

import { _writeRds, _writeRdsAsync, getPgPool } from "./common.js";

function _mapLiveTimerRows(provider, timer) {
  if (!Array.isArray(timer))
    return null;
  const plat = String(provider);
  const now = Date.now();
  const seen = new Map();
  for (const t of timer) {
    if (!t || t.MatchID == null)
      continue;
    const source_match_id = String(t.MatchID);
    seen.set(source_match_id, {
      platform: plat,
      source_match_id,
      round: Number(t.Round) || 0,
      round_start: Number(t.StartTime) || 0,
      updated_at: now,
    });
  }
  return { plat, rows: [...seen.values()] };
}

/** 删除该平台本批快照之外的 platform_matches / platform_bets / live_timers；keepIds=[] 表示空快照全清 */
async function _rdsDeletePlatformSnapshotOrphans(exec, platform, keepSourceMatchIds) {
  const plat = String(platform);
  const ids = (keepSourceMatchIds || []).map(String);
  if (!ids.length) {
    await exec.query(
      `DELETE FROM platform_bets WHERE platform = $1`,
      [plat],
    );
    await exec.query(
      `DELETE FROM live_timers WHERE platform = $1`,
      [plat],
    );
    await exec.query(
      `WITH moved AS (
         DELETE FROM platform_matches WHERE platform = $1
         RETURNING *
       )
       INSERT INTO platform_matches_history (platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id)
       SELECT platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id FROM moved`,
      [plat],
    );
    return;
  }
  await exec.query(
    `DELETE FROM platform_bets
     WHERE platform = $1 AND NOT (source_match_id = ANY($2::text[]))`,
    [plat, ids],
  );
  await exec.query(
    `DELETE FROM live_timers
     WHERE platform = $1 AND NOT (source_match_id = ANY($2::text[]))`,
    [plat, ids],
  );
  await exec.query(
    `WITH moved AS (
       DELETE FROM platform_matches
       WHERE platform = $1 AND NOT (source_match_id = ANY($2::text[]))
       RETURNING *
     )
     INSERT INTO platform_matches_history (platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id)
     SELECT platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id FROM moved`,
    [plat, ids],
  );
}

async function _rdsClearPlatformMatchSnapshot(pool, platform) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await _rdsDeletePlatformSnapshotOrphans(client, platform, []);
    await client.query("COMMIT");
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

async function _rdsUpsertPlatformMatches(pool, rows) {
  if (!rows.length)
    return;
  const client = await pool.connect();
  const platform = String(rows[0].platform);
  const keepIds = rows.map(r => String(r.source_match_id));
  const sql = `
    INSERT INTO platform_matches (
      platform, source_match_id, source_game_id, start_time,
      home_id, home, away_id, away, bo, is_live, teams, synced_at
    )
    SELECT * FROM unnest(
      $1::text[], $2::text[], $3::text[], $4::bigint[],
      $5::text[], $6::text[], $7::text[], $8::text[],
      $9::smallint[], $10::smallint[], $11::jsonb[], $12::bigint[]
    )
    ON CONFLICT (platform, source_match_id) DO UPDATE SET
      source_game_id = EXCLUDED.source_game_id,
      start_time = EXCLUDED.start_time,
      home_id = EXCLUDED.home_id,
      home = EXCLUDED.home,
      away_id = EXCLUDED.away_id,
      away = EXCLUDED.away,
      bo = EXCLUDED.bo,
      is_live = EXCLUDED.is_live,
      teams = EXCLUDED.teams,
      synced_at = EXCLUDED.synced_at
  `;
  try {
    await client.query("BEGIN");
    await client.query(sql, [
      rows.map(r => r.platform),
      rows.map(r => r.source_match_id),
      rows.map(r => r.source_game_id),
      rows.map(r => r.start_time),
      rows.map(r => r.home_id),
      rows.map(r => r.home),
      rows.map(r => r.away_id),
      rows.map(r => r.away),
      rows.map(r => r.bo),
      rows.map(r => r.is_live),
      rows.map(r => JSON.stringify(Array.isArray(r.teams) ? r.teams : [])),
      rows.map(r => r.synced_at),
    ]);
    await _rdsDeletePlatformSnapshotOrphans(client, platform, keepIds);
    await client.query("COMMIT");
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

async function _rdsUpsertPlatformBets(exec, rows) {
  if (!rows.length)
    return;
  const sql = `
    INSERT INTO platform_bets (
      platform, source_match_id, source_bet_id, map, bet_name,
      home_odds, away_odds, is_locked, source_home_id, source_away_id, updated_at
    )
    SELECT * FROM unnest(
      $1::text[], $2::text[], $3::text[], $4::smallint[], $5::text[],
      $6::numeric[], $7::numeric[], $8::boolean[], $9::text[], $10::text[], $11::bigint[]
    )
    ON CONFLICT (platform, source_match_id, source_bet_id) DO UPDATE SET
      map = EXCLUDED.map,
      bet_name = EXCLUDED.bet_name,
      home_odds = EXCLUDED.home_odds,
      away_odds = EXCLUDED.away_odds,
      is_locked = EXCLUDED.is_locked,
      source_home_id = EXCLUDED.source_home_id,
      source_away_id = EXCLUDED.source_away_id,
      updated_at = EXCLUDED.updated_at
  `;
  await exec.query(sql, [
    rows.map(r => r.platform),
    rows.map(r => r.source_match_id),
    rows.map(r => r.source_bet_id),
    rows.map(r => r.map),
    rows.map(r => r.bet_name),
    rows.map(r => r.home_odds),
    rows.map(r => r.away_odds),
    rows.map(r => r.is_locked),
    rows.map(r => r.source_home_id),
    rows.map(r => r.source_away_id),
    rows.map(r => r.updated_at),
  ]);
}

async function _rdsReplacePlatformBets(pool, platform, matchId, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM platform_bets WHERE platform = $1 AND source_match_id = $2",
      [String(platform), String(matchId)],
    );
    await _rdsUpsertPlatformBets(client, rows);
    await client.query("COMMIT");
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

/** 全量替换某平台 timer 快照：先删该平台全部行，再 upsert 本批（空批 = 清空该平台） */
async function _rdsReplaceLiveTimersForPlatform(pool, platform, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM live_timers WHERE platform = $1", [String(platform)]);
    if (rows.length) {
      await client.query(
        `INSERT INTO live_timers (platform, source_match_id, round, round_start, updated_at)
         SELECT * FROM unnest($1::text[], $2::text[], $3::smallint[], $4::bigint[], $5::bigint[])
         ON CONFLICT (platform, source_match_id) DO UPDATE SET
           round = EXCLUDED.round,
           round_start = EXCLUDED.round_start,
           updated_at = EXCLUDED.updated_at`,
        [
          rows.map(r => r.platform),
          rows.map(r => r.source_match_id),
          rows.map(r => r.round),
          rows.map(r => r.round_start),
          rows.map(r => r.updated_at),
        ],
      );
    }
    await client.query("COMMIT");
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

async function _rdsFetchPlatformMatches(pool) {
  const { rows } = await pool.query(
    `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, is_live, teams, match_id,
            binding_confidence, binding_source, binding_side_mode, bound_at
     FROM platform_matches`,
  );
  const byPlatform = {};
  for (const r of rows) {
    if (!byPlatform[r.platform])
      byPlatform[r.platform] = [];
    byPlatform[r.platform].push({
      Type: r.platform,
      SourceMatchID: r.source_match_id,
      SourceGameID: r.source_game_id ?? "",
      StartTime: r.start_time ?? 0,
      Home: r.home ?? "",
      HomeID: r.home_id ?? "",
      Away: r.away ?? "",
      AwayID: r.away_id ?? "",
      BO: r.bo ?? 0,
      IsLive: r.is_live != null ? Number(r.is_live) : undefined,
      Teams: Array.isArray(r.teams) ? r.teams : [],
      ClientMatchId: r.match_id != null ? Number(r.match_id) : null,
      BindingConfidence: r.binding_confidence != null ? Number(r.binding_confidence) : null,
      BindingSource: r.binding_source ?? null,
      BindingSideMode: r.binding_side_mode ?? null,
      BoundAt: r.bound_at != null ? Number(r.bound_at) : null,
    });
  }
  return byPlatform;
}

async function _rdsFetchPlatformBets(pool) {
  const { rows } = await pool.query(
    `SELECT platform, source_bet_id, source_match_id, map, bet_name,
            source_home_id, source_away_id, home_odds, away_odds, is_locked
     FROM platform_bets`,
  );
  const byKey = {};
  for (const r of rows) {
    const key = `${r.platform}:${r.source_match_id}`;
    if (!byKey[key])
      byKey[key] = { provider: r.platform, matchId: r.source_match_id, bets: [], savedAt: 0 };
    byKey[key].bets.push({
      SourceBetID: r.source_bet_id,
      BetName: r.bet_name ?? "",
      Map: r.map ?? 0,
      SourceHomeID: r.source_home_id ?? "",
      SourceAwayID: r.source_away_id ?? "",
      HomeOdds: r.home_odds ?? 0,
      AwayOdds: r.away_odds ?? 0,
      Status: r.is_locked ? "Locked" : "Normal",
    });
  }
  return byKey;
}

async function _rdsFetchLiveTimers(pool) {
  const { rows } = await pool.query(
    "SELECT platform, source_match_id, round, round_start FROM live_timers",
  );
  const byPlatform = {};
  for (const r of rows) {
    if (!byPlatform[r.platform])
      byPlatform[r.platform] = { provider: r.platform, timer: [], savedAt: 0 };
    byPlatform[r.platform].timer.push({
      MatchID: r.source_match_id,
      Round: r.round ?? 0,
      StartTime: r.round_start ?? 0,
    });
  }
  return byPlatform;
}

async function _rdsFetchPlatformCollectorMeta(pool) {
  const { rows } = await pool.query(
    `SELECT 'platformMatches' AS key,
            COUNT(*)::int AS count,
            COALESCE(MAX(synced_at), 0)::bigint AS marker,
            COUNT(match_id)::int AS linked_count,
            COALESCE(MAX(match_id), 0)::bigint AS linked_marker
     FROM platform_matches
     UNION ALL
     SELECT 'platformBets' AS key,
            COUNT(*)::int AS count,
            COALESCE(MAX(updated_at), 0)::bigint AS marker,
            0::int AS linked_count,
            0::bigint AS linked_marker
     FROM platform_bets
     UNION ALL
     SELECT 'liveTimers' AS key,
            COUNT(*)::int AS count,
            COALESCE(MAX(updated_at), 0)::bigint AS marker,
            0::int AS linked_count,
            0::bigint AS linked_marker
     FROM live_timers`,
  );
  const meta = {};
  for (const r of rows) {
    meta[r.key] = {
      count: Number(r.count) || 0,
      marker: Number(r.marker) || 0,
      linkedCount: Number(r.linked_count) || 0,
      linkedMarker: Number(r.linked_marker) || 0,
    };
  }
  return meta;
}

async function _rdsSetPlatformMatchId(pool, platform, sourceMatchId, matchId, onlyIfNull) {
  const sql = onlyIfNull
    ? `UPDATE platform_matches SET match_id = $3
       WHERE platform = $1 AND source_match_id = $2 AND match_id IS NULL`
    : `UPDATE platform_matches SET match_id = $3
       WHERE platform = $1 AND source_match_id = $2`;
  const res = await pool.query(sql, [String(platform), String(sourceMatchId), Number(matchId)]);
  return res.rowCount ?? 0;
}

/**
 * 回写 platform_matches.match_id（RDS）。
 * @returns {Promise<{ updated: boolean, skipped: boolean, conflict: boolean }>}
 */
export async function setPlatformMatchId(platform, sourceMatchId, matchId, opts = {}) {
  const onlyIfNull = opts.onlyIfNull !== false && opts.force !== true;
  const plat = String(platform);
  const srcId = String(sourceMatchId);
  const cmId = Number(matchId);
  if (!Number.isFinite(cmId))
    return { updated: false, skipped: true, conflict: false };

  const pool = getPgPool();
  if (!pool)
    return { updated: false, skipped: true, conflict: false };

  const { rows } = await pool.query(
    "SELECT match_id FROM platform_matches WHERE platform = $1 AND source_match_id = $2",
    [plat, srcId],
  );
  if (!rows.length)
    return { updated: false, skipped: true, conflict: false };

  const cur
    = rows[0].match_id != null && rows[0].match_id !== "" ? Number(rows[0].match_id) : null;
  if (cur === cmId)
    return { updated: false, skipped: true, conflict: false };
  if (cur != null && cur !== cmId && onlyIfNull)
    return { updated: false, skipped: false, conflict: true };

  const n = await _rdsSetPlatformMatchId(pool, plat, srcId, cmId, onlyIfNull);
  return { updated: n > 0, skipped: n === 0, conflict: false };
}

/** 运维解绑：清空 platform_matches 上的赛事链接与 binding 元数据 */
export async function clearPlatformMatchEventLink(platform, sourceMatchId) {
  const plat = String(platform);
  const srcId = String(sourceMatchId);
  const pool = getPgPool();
  if (!pool)
    return { cleared: false, skipped: true };

  const res = await pool.query(
    `UPDATE platform_matches SET
      match_id = NULL,
      binding_confidence = NULL,
      binding_source = NULL,
      binding_side_mode = NULL,
      bound_at = NULL
     WHERE platform = $1 AND source_match_id = $2`,
    [plat, srcId],
  );
  return { cleared: (res.rowCount ?? 0) > 0 };
}

function mapPlatformMatchRows(provider, matchs) {
  const now = Date.now();
  return matchs.map(m => ({
    platform: String(provider),
    source_match_id: String(m.SourceMatchID),
    source_game_id: m.SourceGameID != null ? String(m.SourceGameID) : null,
    start_time: Number(m.StartTime) || null,
    home_id: m.HomeID != null ? String(m.HomeID) : null,
    home: String(m.Home || ""),
    away_id: m.AwayID != null ? String(m.AwayID) : null,
    away: String(m.Away || ""),
    bo: m.BO != null ? Number(m.BO) : null,
    is_live: m.IsLive != null ? Number(m.IsLive) : null,
    teams: Array.isArray(m.Teams) ? m.Teams : [],
    synced_at: now,
  }));
}

/** fire-and-forget：按平台快照 upsert 本批比赛，并删除本批之外的孤儿行（含 platform_bets）；[] = 空快照全清 */
export function writePlatformMatches(provider, matchs) {
  if (!Array.isArray(matchs))
    return;
  const plat = String(provider);
  if (!matchs.length) {
    _writeRds(pool => _rdsClearPlatformMatchSnapshot(pool, plat), "platform_matches", {
      key: `collector:${plat}`,
    });
    return;
  }
  const rows = mapPlatformMatchRows(provider, matchs);
  _writeRds(pool => _rdsUpsertPlatformMatches(pool, rows), "platform_matches", {
    key: `collector:${provider}`,
  });
}

/** 启动时读取 platform_matches，按平台分组，返回可直接传给 store.saveMatches 的格式 */
export async function fetchPlatformMatches() {
  const pool = getPgPool();
  if (!pool)
    return {};
  try {
    return await _rdsFetchPlatformMatches(pool);
  }
  catch (err) {
    console.warn("[rds] fetchPlatformMatches 失败:", err.message);
    return {};
  }
}

/** matcher 快照缓存使用：轻量判断采集表是否变化 */
export async function fetchPlatformCollectorMeta() {
  const pool = getPgPool();
  if (!pool)
    return null;
  try {
    return await _rdsFetchPlatformCollectorMeta(pool);
  }
  catch (err) {
    console.warn("[rds] fetchPlatformCollectorMeta 失败:", err.message);
    return null;
  }
}

/** 从 RDS 读取 platform_bets，重组为 store._bets 格式 */
export async function fetchPlatformBets() {
  const pool = getPgPool();
  if (!pool)
    return {};
  try {
    return await _rdsFetchPlatformBets(pool);
  }
  catch (err) {
    console.warn("[rds] fetchPlatformBets 失败:", err.message);
    return {};
  }
}

/** 从 RDS 读取 live_timers，重组为 store._timers 格式 */
export async function fetchLiveTimers() {
  const pool = getPgPool();
  if (!pool)
    return {};
  try {
    return await _rdsFetchLiveTimers(pool);
  }
  catch (err) {
    console.warn("[rds] fetchLiveTimers 失败:", err.message);
    return {};
  }
}

/** SaveBet 12 字段 → platform_bets 行（A8 协议无 group_name） */
function mapSaveBetRows(provider, matchId, bets) {
  const now = Date.now();
  const rawRows = (bets || [])
    .filter(b => b && b.SourceBetID != null && !String(b.BetName ?? "").includes("+"))
    .map(b => ({
      platform: String(provider),
      source_bet_id: String(b.SourceBetID),
      source_match_id: String(matchId),
      map: Number(b.Map ?? 0),
      bet_name: String(b.BetName || ""),
      source_home_id: String(b.SourceHomeID ?? b.source_home_id ?? "") || null,
      source_away_id: String(b.SourceAwayID ?? b.source_away_id ?? "") || null,
      home_odds: Number(b.HomeOdds) || 0,
      away_odds: Number(b.AwayOdds) || 0,
      is_locked: b.Status !== "Normal",
      updated_at: now,
    }));
  const seen = new Map();
  for (const row of rawRows) seen.set(`${row.source_match_id}:${row.source_bet_id}`, row);
  return [...seen.values()];
}

/** fire-and-forget：upsert 平台盘口赔率（空数组刷新 updated_at 时用） */
export function writePlatformBets(provider, matchId, bets) {
  const rows = mapSaveBetRows(provider, matchId, bets);
  if (!rows.length)
    return;
  _writeRds(pool => _rdsUpsertPlatformBets(pool, rows), "platform_bets", {
    key: `collector:${provider}`,
  });
}

/** [A8 可证实] 每场 saveBets 为完整快照：先删该场旧行再 upsert */
export function replacePlatformBetsForMatch(provider, matchId, bets) {
  const rows = mapSaveBetRows(provider, matchId, bets);
  if (!rows.length)
    return;
  const plat = String(provider);
  const mid = String(matchId);
  _writeRds(pool => _rdsReplacePlatformBets(pool, plat, mid, rows), "platform_bets", {
    key: `collector:${plat}`,
  });
}

/** fire-and-forget：全量替换某平台 timer 快照（对齐 A8 getTimer 整包提交；空数组清空该平台） */
export function writeLiveTimers(provider, timer) {
  const mapped = _mapLiveTimerRows(provider, timer);
  if (!mapped)
    return;
  const { plat, rows } = mapped;
  _writeRds(pool => _rdsReplaceLiveTimersForPlatform(pool, plat, rows), "live_timers", {
    key: `collector:${plat}`,
  });
}

/** await 写入完成（API_SaveLiveTimer 使用，避免紧随其后的 GetMatchs 读到旧 RDS） */
export async function writeLiveTimersAsync(provider, timer) {
  const mapped = _mapLiveTimerRows(provider, timer);
  if (!mapped)
    return;
  const { plat, rows } = mapped;
  await _writeRdsAsync(pool => _rdsReplaceLiveTimersForPlatform(pool, plat, rows), "live_timers");
}

/** 运维/部署：清空某平台 live_timers（等待下次 saveLiveTimer 或 matcher matchMerge 刷新 Round） */
export async function purgePlatformLiveTimers(platform) {
  const plat = String(platform || "").trim();
  if (!plat)
    throw new Error("platform required");
  await _writeRdsAsync(pool => _rdsReplaceLiveTimersForPlatform(pool, plat, []), "live_timers");
}
