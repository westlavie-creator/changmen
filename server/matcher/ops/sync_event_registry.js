/**
 * matchMerge 后同步 match_events 元数据（bindings 仅由 auto-bind / 运维 API 写入）。
 */

import * as db from "@changmen/db";
import {
  deleteMatchEvents,
  fetchMatchEventRow,
  upsertMatchEvents,
} from "@changmen/db";
import { isEventRegistryEnabled } from "../lib/config.js";
import { PAIRING_TIER } from "./pairing_metadata.js";

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

/** 人工拖线 / 运维绑定：从 matchs 槽位构造 match_events 行 */
function buildManualEventStub(eventId, { title, game, game_id, start_time, bo, matchs }) {
  const entries = Object.entries(matchs || {});
  const anchor = entries.find(([p]) => p === "OB") || entries[0];
  return {
    ID: Number(eventId),
    Title: String(title || ""),
    Game: game != null ? String(game) : null,
    GameID: game_id != null ? String(game_id) : null,
    StartTime: Number(start_time) || 0,
    BO: Number(bo) || 0,
    PairingTier: PAIRING_TIER.VERIFIED,
    PairingConfidence: 1,
    EventAnchor: anchor ? `${anchor[0]}:${anchor[1]}` : null,
  };
}

/**
 * 写入 event_bindings 前确保 match_events 行存在（FK event_bindings_event_id_fkey）。
 * @param {number} eventId
 * @param {object} [stub] - merge 行形状 stub；无 client_matches 行时必填
 */
async function ensureMatchEventRecord(eventId, stub) {
  const eid = Number(eventId);
  if (!Number.isFinite(eid))
    throw new Error(`无效的 event_id: ${eventId}`);

  const existing = await fetchMatchEventRow(eid);
  if (existing)
    return existing;

  let mergeRow = stub;
  if (!mergeRow) {
    const cm = await db.fetchClientMatchRow(
      eid,
      "id,title,game,game_id,start_time,bo,pairing_tier,pairing_confidence,event_anchor,home_gb_team_id,away_gb_team_id,built_at",
    );
    if (cm) {
      mergeRow = {
        ID: cm.id,
        Title: cm.title,
        Game: cm.game,
        GameID: cm.game_id,
        StartTime: cm.start_time,
        BO: cm.bo,
        PairingTier: cm.pairing_tier,
        PairingConfidence: cm.pairing_confidence,
        EventAnchor: cm.event_anchor,
        HomeGbTeamId: cm.home_gb_team_id,
        AwayGbTeamId: cm.away_gb_team_id,
      };
    }
  }

  if (!mergeRow)
    throw new Error(`赛事实体 #${eid} 不存在，无法写入绑定`);

  const builtAt = Number(stub?.built_at ?? mergeRow.built_at) || Date.now();
  const eventRows = buildEventRowsFromMergeRows([mergeRow], builtAt);
  if (eventRows.length)
    await upsertMatchEvents(eventRows);

  const created = await fetchMatchEventRow(eid);
  if (!created)
    throw new Error(`创建赛事实体 #${eid} 失败`);
  return created;
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
  buildManualEventStub,
  ensureMatchEventRecord,
  isEventRegistryEnabled,
  syncEventRegistryForMatchMerge,
};
