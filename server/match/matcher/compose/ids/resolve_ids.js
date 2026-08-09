/**
 * client_matches ID 分配：复用 @changmen/match-identity/ids（非 merge）。
 * dry-run 时不 insert stub，仅复用已有 id，否则分配临时负 ID。
 */
import {
  assignMatchIds,
  findLinkedClientIdFromMatchs,
  findReuseIdByMatchsSuperset,
  findReuseIdByPlatformOverlap,
  mayReuseByMergeKey,
  matchsSignature,
  resolveClientMatchIds,
} from "@changmen/match-identity/ids/client_match_ids.js";

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
  return id;
}

function reuseIdSync(row, existing, existingById, matches, byMergeKey, byMatchsSig, batchAssigned, existingIdKeyIndex) {
  const mergeKey = row.MergeKey ? String(row.MergeKey) : null;
  let id = Number(row.ID) || 0;

  if (!id && mergeKey?.startsWith("match:id:"))
    id = lookupMergeKeyId(byMergeKey, existingById, mergeKey, row.Matchs, batchAssigned);
  if (!id && matches) {
    id = findLinkedClientIdFromMatchs(row.Matchs, matches, {
      mergeKey,
      existingIdKeyIndex,
    }) || 0;
  }
  if (!id && mergeKey)
    id = lookupMergeKeyId(byMergeKey, existingById, mergeKey, row.Matchs, batchAssigned);
  if (!id) {
    const sig = matchsSignature(row.Matchs);
    if (sig)
      id = byMatchsSig.get(sig) || 0;
  }
  if (!id)
    id = findReuseIdByMatchsSuperset(existing, row.Matchs) || 0;
  if (!id)
    id = findReuseIdByPlatformOverlap(existing, row.Matchs) || 0;
  return { id, mergeKey };
}

/**
 * dry-run：不写 stub；新场用临时负 ID（仅内存对照）。
 */
export function resolveIdsDryRun(builtRows, {
  matches,
  existingClientRows = [],
  existingIdKeyIndex,
} = {}) {
  const existingById = new Map(
    (existingClientRows || []).map(row => [Number(row.id), row]),
  );
  const byMergeKey = new Map();
  const byMatchsSig = new Map();
  for (const row of existingClientRows || []) {
    const id = Number(row.id);
    if (row.merge_key)
      byMergeKey.set(String(row.merge_key), id);
    const sig = matchsSignature(row.matchs || row.Matchs);
    if (sig && !byMatchsSig.has(sig))
      byMatchsSig.set(sig, id);
  }
  if (existingIdKeyIndex) {
    for (const [key, id] of existingIdKeyIndex) {
      if (!byMergeKey.has(key))
        byMergeKey.set(key, Number(id));
    }
  }
  const batchAssigned = new Map();
  let tempSeq = -1;
  const out = [];
  for (const row of builtRows || []) {
    const { id: reuse, mergeKey } = reuseIdSync(
      row,
      existingClientRows,
      existingById,
      matches,
      byMergeKey,
      byMatchsSig,
      batchAssigned,
      existingIdKeyIndex,
    );
    let id = reuse;
    if (!id) {
      id = tempSeq;
      tempSeq -= 1;
    }
    if (mergeKey)
      batchAssigned.set(mergeKey, id);
    const sig = matchsSignature(row.Matchs);
    if (sig)
      byMatchsSig.set(sig, id);
    out.push(assignMatchIds(row, id));
  }
  return out;
}

/**
 * 写库路径：完整 resolveClientMatchIds（可 insert stub）。
 */
export async function resolveIdsForWrite(adapter, builtRows, { matches, existingIdKeyIndex } = {}) {
  return resolveClientMatchIds(adapter, builtRows, { matches, existingIdKeyIndex });
}
