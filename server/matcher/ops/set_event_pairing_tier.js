/**
 * 运维设置 match_events / client_matches 的 pairing_tier（可锁定）。
 */

import { updateMatchEventPairingTier } from "@changmen/db";
import { PAIRING_TIER } from "./pairing_metadata.js";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import { matchMergeOnce } from "./match_merge_once.js";
import { isEventRegistryEnabled } from "./sync_event_registry.js";

async function setMatchEventPairingTier(eventId, { tier, confidence, lock, matchMerge = true }) {
  if (!isEventRegistryEnabled())
    throw new Error("MATCHER_EVENT_REGISTRY=0，真相表未启用");

  const write = await updateMatchEventPairingTier(eventId, {
    tier,
    confidence,
    lock: lock !== false,
  });

  if (!write.updated)
    throw new Error(`赛事 #${eventId} 不存在或未更新`);

  invalidateMatcherRdsSnapshot(["clientMatches"]);

  let merge = null;
  if (matchMerge !== false)
    merge = await matchMergeOnce({ afterInFlight: true });

  return {
    ok: true,
    ...write,
    matchMerge: merge ? { matchCount: merge.matchCount ?? null } : null,
    summary: `赛事 #${eventId} pairing_tier=${write.pairing_tier}${write.locked ? "（已锁定）" : ""}`,
  };
}

async function confirmMatchEventPairingTier(eventId) {
  return setMatchEventPairingTier(eventId, {
    tier: PAIRING_TIER.VERIFIED,
    confidence: 1,
    lock: true,
  });
}

export {
  confirmMatchEventPairingTier,
  setMatchEventPairingTier,
};
