/**
 * 人工运维写 platform_matches.binding_source=manual（拖线 / 合并 / 确认配对）。
 */

import * as db from "@changmen/db";
import { upsertEventBindings, upsertPlatformBindings } from "@changmen/db";
import {
  BINDING_SOURCE,
  bindingSideModeForPlatform,
} from "./pairing_metadata.js";
import { isEventRegistryEnabled } from "./sync_event_registry.js";

function bindingSideModeFromReversed(reversed) {
  if (reversed === true)
    return "reversed";
  return "aligned";
}

/**
 * @param {Array<{
 *   platform: string,
 *   source_match_id: string,
 *   match_id: number,
 *   reversed?: boolean,
 *   binding_side_mode?: string,
 * }>} entries
 */
async function persistManualPlatformBindings(entries) {
  const now = Date.now();
  const bindings = (entries || [])
    .filter(e => e?.platform && e?.source_match_id && Number.isFinite(Number(e.match_id)))
    .map(e => ({
      platform: String(e.platform),
      source_match_id: String(e.source_match_id),
      match_id: Number(e.match_id),
      binding_confidence: 1,
      binding_source: BINDING_SOURCE.MANUAL,
      binding_side_mode: e.binding_side_mode ?? bindingSideModeFromReversed(e.reversed),
      bound_at: now,
    }));

  if (!bindings.length)
    return { updated: 0 };

  const platformWrite = await upsertPlatformBindings(bindings);

  if (isEventRegistryEnabled()) {
    await upsertEventBindings(bindings.map(b => ({
      platform: b.platform,
      source_match_id: b.source_match_id,
      event_id: b.match_id,
      binding_confidence: b.binding_confidence,
      binding_source: b.binding_source,
      binding_side_mode: b.binding_side_mode,
      bound_at: b.bound_at,
    })), { force: true });
  }

  return platformWrite;
}

function clientRowForBinding(cmRow) {
  return {
    Matchs: cmRow?.matchs || {},
    Reverse: Array.isArray(cmRow?.reverse) ? cmRow.reverse : [],
    SideAlignAmbiguous: [],
  };
}

async function persistManualBindingsForClientMatch(clientMatchId, columns = "id,matchs,reverse") {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId))
    throw new Error("无效的 client_match id");

  const cmRow = await db.fetchClientMatchRow(cmId, columns);
  if (!cmRow?.matchs || !Object.keys(cmRow.matchs).length)
    return { updated: 0 };

  const bindingRow = clientRowForBinding(cmRow);
  const entries = Object.entries(cmRow.matchs).map(([platform, sourceId]) => ({
    platform,
    source_match_id: String(sourceId),
    match_id: cmId,
    binding_side_mode: bindingSideModeForPlatform(bindingRow, platform),
  }));

  return persistManualPlatformBindings(entries);
}

export {
  bindingSideModeFromReversed,
  persistManualBindingsForClientMatch,
  persistManualPlatformBindings,
};
