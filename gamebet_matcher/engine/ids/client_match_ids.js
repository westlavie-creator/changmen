"use strict";

const { stableId } = require("../teams/match_utils");

function matchsSignature(matchs) {
  return Object.entries(matchs || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plat, srcId]) => `${plat}:${String(srcId)}`)
    .join("|");
}

/** existing ⊆ built（平台与 source id 一致）时视为同场升级，复用旧 client_matches.id */
function matchsIsSubset(subMatchs, superMatchs) {
  const sub = Object.entries(subMatchs || {});
  if (!sub.length) return false;
  for (const [plat, srcId] of sub) {
    if (String(superMatchs?.[plat] ?? "") !== String(srcId)) return false;
  }
  return true;
}

function findReuseIdByMatchsSuperset(existingRows, builtMatchs) {
  let bestId = 0;
  let bestCount = 0;
  for (const row of existingRows || []) {
    if (!matchsIsSubset(row.matchs, builtMatchs)) continue;
    const count = Object.keys(row.matchs || {}).length;
    if (count > bestCount) {
      bestCount = count;
      bestId = Number(row.id);
    }
  }
  return bestId;
}

function findPlatformMatch(matches, provider, sourceMatchId) {
  const sid = String(sourceMatchId);
  const byId = matches?.[provider];
  if (!byId) return null;
  if (byId[sid]) return byId[sid];
  return Object.values(byId).find((m) => String(m.SourceMatchID) === sid) || null;
}

/** 对齐阶段已在内存写入的 ClientMatchId（链接到已有 client 行，禁止新建 id） */
function findLinkedClientIdFromMatchs(builtMatchs, matches) {
  const ids = new Set();
  for (const [plat, srcId] of Object.entries(builtMatchs || {})) {
    const m = findPlatformMatch(matches, plat, srcId);
    const cid = m?.ClientMatchId ?? m?.client_match_id ?? m?.match_id;
    if (cid != null && cid !== "") ids.add(Number(cid));
  }
  if (!ids.size) return 0;
  if (ids.size === 1) return [...ids][0];
  return Math.min(...ids);
}

/** 与已有 client 行存在相同 platform:sourceId 时复用其 id */
function findReuseIdByPlatformOverlap(existingRows, builtMatchs) {
  let bestId = 0;
  let bestOverlap = 0;
  for (const row of existingRows || []) {
    let overlap = 0;
    for (const [plat, srcId] of Object.entries(builtMatchs || {})) {
      if (String(row.matchs?.[plat] ?? "") === String(srcId)) overlap++;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestId = Number(row.id);
    }
  }
  return bestOverlap > 0 ? bestId : 0;
}

function manualMergeKey(platformA, sourceIdA, platformB, sourceIdB) {
  const keys = [
    `${String(platformA)}:${String(sourceIdA)}`,
    `${String(platformB)}:${String(sourceIdB)}`,
  ].sort();
  return `manual:${keys.join("|")}`;
}

function assignMatchIds(row, id) {
  const numericId = Number(id);
  return {
    ...row,
    ID: numericId,
    Bets: (row.Bets || []).map((bet) => ({
      ...bet,
      MatchID: numericId,
      ID: stableId(`bet:${numericId}:${bet.Map ?? 0}`),
    })),
  };
}

async function insertClientMatchRow(client, mergeKey, stub) {
  const { data, error } = await client
    .from("client_matches")
    .insert({
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
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: dup, error: dupErr } = await client
      .from("client_matches")
      .select("id")
      .eq("merge_key", mergeKey)
      .single();
    if (dupErr) throw dupErr;
    return Number(dup.id);
  }
  if (error) throw error;
  return Number(data.id);
}

/**
 * 为 buildClientMatchList 产出的行分配 id。
 * 优先复用已有 client_matches.id（含对齐链接、平台重叠）；仅全新场次才 insert。
 */
async function resolveClientMatchIds(client, builtRows, { matches } = {}) {
  if (!client) throw new Error("Supabase client required");
  if (!builtRows?.length) return [];

  const { data: existing, error } = await client
    .from("client_matches")
    .select("id, merge_key, matchs");
  if (error) throw error;

  const byMergeKey = new Map();
  const byMatchsSig = new Map();
  for (const row of existing || []) {
    const id = Number(row.id);
    if (row.merge_key) byMergeKey.set(row.merge_key, id);
    const sig = matchsSignature(row.matchs);
    if (sig && !byMatchsSig.has(sig)) byMatchsSig.set(sig, id);
  }

  const batchAssigned = new Map();
  const resolved = [];

  for (const row of builtRows) {
    const mergeKey = row.MergeKey ? String(row.MergeKey) : null;
    let id = Number(row.ID) || 0;

    if (!id && matches) {
      id = findLinkedClientIdFromMatchs(row.Matchs, matches);
    }
    if (!id && mergeKey) {
      id = batchAssigned.get(mergeKey) || byMergeKey.get(mergeKey) || 0;
    }
    if (!id) {
      const sig = matchsSignature(row.Matchs);
      if (sig) id = byMatchsSig.get(sig) || 0;
    }
    if (!id) {
      id = findReuseIdByMatchsSuperset(existing, row.Matchs);
    }
    if (!id) {
      id = findReuseIdByPlatformOverlap(existing, row.Matchs);
    }
    if (!id && mergeKey) {
      id = await insertClientMatchRow(client, mergeKey, {
        title: row.Title,
        game: row.Game,
        game_id: row.GameID,
        start_time: row.StartTime,
        bo: row.BO,
        round: row.Round,
        round_start: row.RoundStart,
        matchs: row.Matchs,
      });
      byMergeKey.set(mergeKey, id);
    }
    if (!id) {
      throw new Error(`无法为赛事分配 id（merge_key=${mergeKey || "null"}）`);
    }

    if (mergeKey) batchAssigned.set(mergeKey, id);
    const sig = matchsSignature(row.Matchs);
    if (sig) byMatchsSig.set(sig, id);
    resolved.push(assignMatchIds(row, id));
  }

  return resolved;
}

/** 人工关联前确保 client_matches 行存在，返回自增 id */
async function ensureClientMatchId(client, mergeKey, stub = {}) {
  if (!client) throw new Error("Supabase client required");
  const key = String(mergeKey || "").trim();
  if (!key) throw new Error("merge_key 不能为空");

  const { data: existing, error } = await client
    .from("client_matches")
    .select("id")
    .eq("merge_key", key)
    .maybeSingle();
  if (error) throw error;
  if (existing?.id != null) return Number(existing.id);

  return insertClientMatchRow(client, key, stub);
}

module.exports = {
  matchsSignature,
  matchsIsSubset,
  findReuseIdByMatchsSuperset,
  findLinkedClientIdFromMatchs,
  findReuseIdByPlatformOverlap,
  manualMergeKey,
  assignMatchIds,
  resolveClientMatchIds,
  ensureClientMatchId,
};
