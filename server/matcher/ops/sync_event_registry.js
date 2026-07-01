/**
 * matchMerge 后同步 match_events 元数据（bindings 仅由 auto-bind / 运维 API 写入）。
 */

import {
  deleteMatchEvents,
  upsertMatchEvents,
} from "@changmen/db";
import { isEventRegistryEnabled } from "../lib/config.js";

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
 * @param {{ rows: object[], builtAt?: number, deletedEventIds?: number[] }} opts
 */
async function syncEventRegistryForMatchMerge(opts = {}) {
  if (!isEventRegistryEnabled())
    return { skipped: true };

  const { rows, builtAt, deletedEventIds } = opts;
  const eventRows = buildEventRowsFromMergeRows(rows, builtAt);
  const events = await upsertMatchEvents(eventRows);

  let deleted = 0;
  if (deletedEventIds?.length) {
    const del = await deleteMatchEvents(deletedEventIds);
    deleted = del.deleted ?? 0;
  }

  return {
    events: events.updated ?? 0,
    bindings: 0,
    deleted,
  };
}

export {
  buildEventRowsFromMergeRows,
  isEventRegistryEnabled,
  syncEventRegistryForMatchMerge,
};
