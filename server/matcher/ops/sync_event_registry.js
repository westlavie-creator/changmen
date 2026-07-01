/**
 * matchMerge 后双写 match_events / event_bindings（C 档真相表）。
 * 开关见 matcher/lib/config.js eventRegistry（默认开启）。
 */

import {
  deleteMatchEvents,
  upsertEventBindings,
  upsertMatchEvents,
} from "@changmen/db";
import { isEventRegistryEnabled } from "../lib/config.js";
import { collectBindingsForRows } from "./pairing_metadata.js";

function gbTeamIdFromRow(row) {
  const raw = row.HomeGbTeamId ?? row.home_gb_team_id;
  if (raw == null || raw === "")
    return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildEventRowsFromMergeRows(rows, builtAt) {
  const now = builtAt || Date.now();
  return (rows || [])
    .filter(r => Number.isFinite(Number(r.ID)))
    .map(r => ({
      id: Number(r.ID),
      title: String(r.Title || ""),
      game: r.Game != null ? String(r.Game) : null,
      game_id: r.GameID != null ? String(r.GameID) : null,
      start_time: Number(r.StartTime) || 0,
      bo: Number(r.BO) || 0,
      pairing_tier: r.PairingTier ?? null,
      pairing_confidence: r.PairingConfidence ?? null,
      event_anchor: r.EventAnchor ?? null,
      home_gb_team_id: gbTeamIdFromRow(r),
      away_gb_team_id: (() => {
        const raw = r.AwayGbTeamId ?? r.away_gb_team_id;
        if (raw == null || raw === "")
          return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      built_at: now,
    }));
}

/**
 * @param {{ rows: object[], matches: object, builtAt?: number, deletedEventIds?: number[] }} opts
 */
async function syncEventRegistryForMatchMerge(opts = {}) {
  if (!isEventRegistryEnabled())
    return { skipped: true };

  const { rows, matches, builtAt, deletedEventIds } = opts;
  const eventRows = buildEventRowsFromMergeRows(rows, builtAt);
  const events = await upsertMatchEvents(eventRows);

  const bindings = collectBindingsForRows(rows, matches).map(b => ({
    platform: b.platform,
    source_match_id: b.source_match_id,
    event_id: Number(b.match_id),
    binding_confidence: b.binding_confidence,
    binding_source: b.binding_source,
    binding_side_mode: b.binding_side_mode,
    bound_at: b.bound_at,
  }));
  const bindingWrite = await upsertEventBindings(bindings);

  let deleted = 0;
  if (deletedEventIds?.length) {
    const del = await deleteMatchEvents(deletedEventIds);
    deleted = del.deleted ?? 0;
  }

  return {
    events: events.updated ?? 0,
    bindings: bindingWrite.updated ?? 0,
    deleted,
  };
}

export {
  buildEventRowsFromMergeRows,
  isEventRegistryEnabled,
  syncEventRegistryForMatchMerge,
};
