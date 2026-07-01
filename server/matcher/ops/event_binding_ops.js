/**
 * 运维 API：仅写 event_bindings 真相表，再 reconcile + matchMerge 物化。
 */

import * as db from "@changmen/db";
import {
  deleteEventBinding,
  fetchEventBindingRow,
  fetchMatchEventRow,
  upsertEventBindings,
  upsertMatchEvents,
} from "@changmen/db";
import { BINDING_SOURCE } from "./pairing_metadata.js";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import { runManualRegistryReconcile } from "./run_registry_reconcile.js";
import { isEventRegistryEnabled } from "./sync_event_registry.js";
import { buildEventRowsFromMergeRows } from "./sync_event_registry.js";

function assertRegistryEnabled() {
  if (!isEventRegistryEnabled())
    throw new Error("真相表未启用（lib/config.js eventRegistry=false）");
}

function normalizeBindingSideMode(mode, reversed) {
  if (mode)
    return String(mode);
  if (reversed === true)
    return "reversed";
  return "aligned";
}

/**
 * 纯校验逻辑（可单测）。
 */
function assessEventBindingPreview({
  platform,
  sourceMatchId,
  eventId,
  platformRow,
  eventRow,
  clientRow,
  currentBinding,
}) {
  const plat = String(platform || "").trim();
  const sid = String(sourceMatchId || "").trim();
  const eid = Number(eventId);
  const warnings = [];
  const errors = [];

  if (!plat || !sid || !Number.isFinite(eid))
    errors.push("参数不完整");

  if (!platformRow)
    errors.push(`平台场次不存在：${plat}:${sid}`);
  if (!eventRow && !clientRow)
    errors.push(`赛事实体不存在：#${eid}`);

  if (clientRow?.matchs) {
    const slot = clientRow.matchs[plat];
    if (slot != null && slot !== "" && String(slot) !== sid) {
      errors.push(`目标赛事 #${eid} 已有 ${plat} 槽位 ${slot}，与 ${sid} 冲突`);
    }
  }

  if (currentBinding && Number(currentBinding.event_id) !== eid) {
    warnings.push(`将覆盖现有真相绑定 #${currentBinding.event_id} → #${eid}`);
  }

  const pmMatchId = platformRow?.match_id != null ? Number(platformRow.match_id) : null;
  if (pmMatchId != null && pmMatchId !== eid)
    warnings.push(`platform_matches.match_id=${pmMatchId} 与目标赛事不一致，reconcile 后将修正`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    platform: plat,
    source_match_id: sid,
    event_id: eid,
    current_binding: currentBinding || null,
    platform_match_id: pmMatchId,
  };
}

async function ensureMatchEventRecord(eventId) {
  const existing = await fetchMatchEventRow(eventId);
  if (existing)
    return existing;

  const cm = await db.fetchClientMatchRow(eventId, "id,title,game,game_id,start_time,bo,pairing_tier,pairing_confidence,event_anchor,home_gb_team_id,away_gb_team_id,built_at");
  if (!cm)
    throw new Error(`赛事实体 #${eventId} 不存在`);

  const stub = buildEventRowsFromMergeRows([{
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
  }], cm.built_at || Date.now());

  if (stub.length)
    await upsertMatchEvents(stub);

  return fetchMatchEventRow(eventId);
}

async function previewEventBinding({ platform, sourceMatchId, eventId }) {
  assertRegistryEnabled();

  const plat = String(platform || "").trim();
  const sid = String(sourceMatchId || "").trim();
  const eid = Number(eventId);

  const [platformRow, eventRow, clientRow, currentBinding] = await Promise.all([
    db.fetchPlatformMatchRow(plat, sid),
    fetchMatchEventRow(eid),
    db.fetchClientMatchRow(eid, "id,title,matchs,game,game_id,start_time"),
    fetchEventBindingRow(plat, sid),
  ]);

  return assessEventBindingPreview({
    platform: plat,
    sourceMatchId: sid,
    eventId: eid,
    platformRow,
    eventRow,
    clientRow,
    currentBinding,
  });
}

async function finishBindingOps() {
  invalidateMatcherRdsSnapshot(["platformMatches", "clientMatches"]);
  return runManualRegistryReconcile({ matchMerge: true });
}

async function bindPlatformToEvent({
  platform,
  sourceMatchId,
  eventId,
  bindingSideMode,
  reversed,
}) {
  const preview = await previewEventBinding({ platform, sourceMatchId, eventId });
  if (!preview.ok)
    throw new Error(preview.errors.join("；"));

  await ensureMatchEventRecord(preview.event_id);

  const now = Date.now();
  const write = await upsertEventBindings([{
    platform: preview.platform,
    source_match_id: preview.source_match_id,
    event_id: preview.event_id,
    binding_confidence: 1,
    binding_source: BINDING_SOURCE.MANUAL,
    binding_side_mode: normalizeBindingSideMode(bindingSideMode, reversed),
    bound_at: now,
  }], { force: true });

  const followUp = await finishBindingOps();

  return {
    ok: true,
    ...preview,
    binding_updated: write.updated ?? 0,
    reconcile: followUp,
    summary: `${preview.platform} #${preview.source_match_id} → 赛事 #${preview.event_id}（真相表 manual）`,
  };
}

async function unbindPlatformFromEvent({ platform, sourceMatchId }) {
  assertRegistryEnabled();

  const plat = String(platform || "").trim();
  const sid = String(sourceMatchId || "").trim();
  if (!plat || !sid)
    throw new Error("参数不完整");

  const current = await fetchEventBindingRow(plat, sid);
  const deleted = await deleteEventBinding(plat, sid, { force: true });
  const cleared = await db.clearPlatformMatchEventLink(plat, sid);

  const followUp = await finishBindingOps();

  return {
    ok: true,
    platform: plat,
    source_match_id: sid,
    had_binding: !!current,
    deleted: deleted.deleted ?? 0,
    platform_cleared: cleared.cleared,
    reconcile: followUp,
    summary: `已解绑 ${plat} #${sid}${current ? `（原赛事 #${current.event_id}）` : ""}`,
  };
}

export {
  assessEventBindingPreview,
  bindPlatformToEvent,
  previewEventBinding,
  unbindPlatformFromEvent,
};
