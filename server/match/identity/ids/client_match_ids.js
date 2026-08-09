import { stableBetId } from "../teams/match_utils.js";

function matchsSignature(matchs) {
  return Object.entries(matchs || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plat, srcId]) => `${plat}:${String(srcId)}`)
    .join("|");
}

/** sticky ended_at 行：仅平台源 id 重叠时才允许 merge_key 复用（同场回灌）；重赛必须新 id */
function isEndedClientRow(row) {
  const ended = row?.ended_at ?? row?.endedAt;
  return ended != null && ended !== "";
}

function matchsHavePlatformOverlap(a, b) {
  for (const [plat, srcId] of Object.entries(b || {})) {
    if (String(a?.[plat] ?? "") === String(srcId))
      return true;
  }
  return false;
}

/** ended 且无平台重叠 → 禁止走 merge_key / id-key 复用（否则重赛撞上 sticky 永久消失） */
function mayReuseByMergeKey(existingRow, builtMatchs) {
  if (!existingRow)
    return false;
  if (!isEndedClientRow(existingRow))
    return true;
  return matchsHavePlatformOverlap(existingRow.matchs || existingRow.Matchs, builtMatchs);
}

/** existing ⊆ built（平台与 source id 一致）时视为同场升级，复用旧 client_matches.id */
function matchsIsSubset(subMatchs, superMatchs) {
  const sub = Object.entries(subMatchs || {});
  if (!sub.length)
    return false;
  for (const [plat, srcId] of sub) {
    if (String(superMatchs?.[plat] ?? "") !== String(srcId))
      return false;
  }
  return true;
}

function findReuseIdByMatchsSuperset(existingRows, builtMatchs) {
  let bestId = 0;
  let bestCount = 0;
  for (const row of existingRows || []) {
    if (!matchsIsSubset(row.matchs, builtMatchs))
      continue;
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
  if (!byId)
    return null;
  if (byId[sid])
    return byId[sid];
  return Object.values(byId).find(m => String(m.SourceMatchID) === sid) || null;
}

/** 对齐阶段已在内存写入的 ClientMatchId（链接到已有 client 行，禁止新建 id） */
function findLinkedClientIdFromMatchs(builtMatchs, matches, { mergeKey, existingIdKeyIndex } = {}) {
  const ids = new Set();
  for (const [plat, srcId] of Object.entries(builtMatchs || {})) {
    const m = findPlatformMatch(matches, plat, srcId);
    const cid = m?.ClientMatchId ?? m?.client_match_id ?? m?.match_id;
    if (cid != null && cid !== "")
      ids.add(Number(cid));
  }
  if (!ids.size)
    return 0;
  if (ids.size === 1)
    return [...ids][0];

  const idList = [...ids].sort((a, b) => a - b);
  const preferred
    = mergeKey?.startsWith("match:id:") ? existingIdKeyIndex?.get(mergeKey) : null;
  if (preferred != null && ids.has(preferred)) {
    console.warn(
      `[client_match_ids] platform match_id 冲突 ${idList.join(" vs ")}，采用 match:id 索引 #${preferred}`,
    );
    return preferred;
  }

  console.warn(
    `[client_match_ids] platform match_id 冲突 ${idList.join(" vs ")}，跳过链接 id，改由 merge_key/重叠复用`,
    JSON.stringify(builtMatchs),
  );
  return 0;
}

/** 与已有 client 行存在相同 platform:sourceId 时复用其 id */
function findReuseIdByPlatformOverlap(existingRows, builtMatchs) {
  let bestId = 0;
  let bestOverlap = 0;
  for (const row of existingRows || []) {
    let overlap = 0;
    for (const [plat, srcId] of Object.entries(builtMatchs || {})) {
      if (String(row.matchs?.[plat] ?? "") === String(srcId))
        overlap++;
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
    Bets: (row.Bets || []).map(bet => ({
      ...bet,
      MatchID: numericId,
      ID: stableBetId(numericId, bet.Map ?? 0),
    })),
  };
}

async function insertClientMatchRow(adapter, mergeKey, stub) {
  return adapter.insertClientMatchStub(mergeKey, stub);
}

/**
 * 为 buildClientMatchList 产出的行分配 id。
 * 优先复用已有 client_matches.id（含对齐链接、平台重叠）；仅全新场次才 insert。
 *
 * ended 行：merge_key / id-key 仅在平台源 id 重叠时复用（同场回灌）。
 * 同队对重赛（新 SourceMatchID、同 bare merge_key）必须新 id，否则 sticky ended 会让
 * Client_GetMatchs 永久看不到新场。
 */
function lookupMergeKeyId(byMergeKey, existingById, mergeKey, builtMatchs, batchAssigned) {
  if (!mergeKey)
    return 0;
  if (batchAssigned?.has(mergeKey))
    return Number(batchAssigned.get(mergeKey)) || 0;
  const id = Number(byMergeKey.get(mergeKey)) || 0;
  if (!id)
    return 0;
  const row = existingById.get(id);
  if (row && !mayReuseByMergeKey(row, builtMatchs))
    return 0;
  // idKeyIndex 可能指向不在 existing 里的 id：无 ended 信息时允许复用
  return id;
}

async function resolveClientMatchIds(adapter, builtRows, { matches, existingIdKeyIndex } = {}) {
  if (!adapter)
    throw new Error("client match adapter required");
  if (!builtRows?.length)
    return [];

  const existing = await adapter.fetchClientMatchIndex();
  const idKeyIndex = existingIdKeyIndex || new Map();
  const existingById = new Map(
    (existing || []).map(row => [Number(row.id), row]),
  );

  const byMergeKey = new Map();
  const byMatchsSig = new Map();
  for (const row of existing || []) {
    const id = Number(row.id);
    if (row.merge_key)
      byMergeKey.set(String(row.merge_key), id);
    const sig = matchsSignature(row.matchs);
    if (sig && !byMatchsSig.has(sig))
      byMatchsSig.set(sig, id);
  }
  for (const [key, id] of idKeyIndex) {
    if (!byMergeKey.has(key))
      byMergeKey.set(key, Number(id));
  }

  const batchAssigned = new Map();
  const resolved = [];

  for (const row of builtRows) {
    const mergeKey = row.MergeKey ? String(row.MergeKey) : null;
    let id = Number(row.ID) || 0;

    if (!id && mergeKey?.startsWith("match:id:")) {
      id = lookupMergeKeyId(byMergeKey, existingById, mergeKey, row.Matchs, batchAssigned);
    }
    if (!id && matches) {
      id = findLinkedClientIdFromMatchs(row.Matchs, matches, { mergeKey, existingIdKeyIndex: idKeyIndex });
    }
    if (!id && mergeKey) {
      id = lookupMergeKeyId(byMergeKey, existingById, mergeKey, row.Matchs, batchAssigned);
    }
    if (!id) {
      const sig = matchsSignature(row.Matchs);
      if (sig)
        id = byMatchsSig.get(sig) || 0;
    }
    if (!id) {
      id = findReuseIdByMatchsSuperset(existing, row.Matchs);
    }
    if (!id) {
      id = findReuseIdByPlatformOverlap(existing, row.Matchs);
    }
    if (!id && mergeKey) {
      id = await insertClientMatchRow(adapter, mergeKey, {
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

    if (mergeKey)
      batchAssigned.set(mergeKey, id);
    const sig = matchsSignature(row.Matchs);
    if (sig)
      byMatchsSig.set(sig, id);
    resolved.push(assignMatchIds(row, id));
  }

  return resolved;
}

/** 人工关联前确保 client_matches 行存在，返回自增 id */
async function ensureClientMatchId(adapter, mergeKey, stub = {}) {
  if (!adapter)
    throw new Error("client match adapter required");
  const key = String(mergeKey || "").trim();
  if (!key)
    throw new Error("merge_key 不能为空");

  const existing = await adapter.findClientMatchIdByMergeKey(key);
  if (existing != null)
    return Number(existing);

  return insertClientMatchRow(adapter, key, stub);
}

export {
  assignMatchIds,
  ensureClientMatchId,
  findLinkedClientIdFromMatchs,
  findReuseIdByMatchsSuperset,
  findReuseIdByPlatformOverlap,
  isEndedClientRow,
  manualMergeKey,
  matchsHavePlatformOverlap,
  matchsIsSubset,
  matchsSignature,
  mayReuseByMergeKey,
  resolveClientMatchIds,
};
