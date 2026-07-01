/**
 * 运维确认队名层配对：将 client_match 下各平台 binding_source 升为 manual。
 */

import { updateMatchEventPairingTier } from "@changmen/db";
import { persistManualBindingsForClientMatch } from "./manual_binding.js";
import { PAIRING_TIER } from "./pairing_metadata.js";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import { matchMergeOnce } from "./match_merge_once.js";
import * as db from "@changmen/db";

async function confirmClientMatchPairing(clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId))
    throw new Error("无效的 client_match id");

  const cmRow = await db.fetchClientMatchRow(cmId, "id,title,matchs");
  if (!cmRow?.matchs || Object.keys(cmRow.matchs).length < 2)
    throw new Error("赛事需至少 2 个平台才可确认配对");

  const write = await persistManualBindingsForClientMatch(cmId);
  await updateMatchEventPairingTier(cmId, {
    tier: PAIRING_TIER.VERIFIED,
    confidence: 1,
    lock: true,
  });
  invalidateMatcherRdsSnapshot(["platformMatches", "clientMatches"]);
  const matchMerge = await matchMergeOnce({ afterInFlight: true });

  return {
    ok: true,
    client_match_id: cmId,
    title: cmRow.title || null,
    platforms: Object.keys(cmRow.matchs).length,
    bindings_updated: write.updated ?? 0,
    matchMerge: { matchCount: matchMerge?.matchCount ?? null },
    summary: `赛事 #${cmId} 已人工确认配对（${Object.keys(cmRow.matchs).length} 平台 → verified）`,
  };
}

export { confirmClientMatchPairing };
