"use strict";

const { stableId } = require("../esport-api/match_utils");

function matchsSignature(matchs) {
  return Object.entries(matchs || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plat, srcId]) => `${plat}:${String(srcId)}`)
    .join("|");
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
 * 为 buildClientMatchList 产出的行分配自增 id（按 merge_key / matchs / 已有 match_id 复用）。
 */
async function resolveClientMatchIds(client, builtRows) {
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

    if (!id && mergeKey) {
      id = batchAssigned.get(mergeKey) || byMergeKey.get(mergeKey) || 0;
    }
    if (!id) {
      const sig = matchsSignature(row.Matchs);
      if (sig) id = byMatchsSig.get(sig) || 0;
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
  manualMergeKey,
  assignMatchIds,
  resolveClientMatchIds,
  ensureClientMatchId,
};
