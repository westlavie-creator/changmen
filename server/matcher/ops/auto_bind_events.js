/**
 * Event-first：merge 前为未绑定平台场次自动写 event_bindings（不覆盖 manual）。
 */

import {
  fetchAllEventBindings,
  reconcilePlatformMatchesFromRegistry,
  upsertEventBindings,
  upsertMatchEvents,
} from "@changmen/db";
import {
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  ensureClientMatchId,
  normalizeMatchesShape,
} from "@changmen/match-engine";
import { getGameCodeForPlatformId, resolveClientGame } from "@changmen/shared/catalog/game_catalog";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";
import { formatTitle } from "@changmen/match-engine/teams/match_utils.js";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { startTimesCompatible } from "@changmen/match-engine";
import { BINDING_SOURCE } from "./pairing_metadata.js";
import { collectBindingsForRows } from "./pairing_metadata.js";

function bindingKey(platform, sourceMatchId) {
  return `${String(platform)}:${String(sourceMatchId)}`;
}

function findPlatformMatch(matches, platform, sourceMatchId) {
  const sid = String(sourceMatchId);
  const byId = matches?.[platform];
  if (!byId)
    return null;
  if (byId[sid])
    return byId[sid];
  return Object.values(byId).find(m => String(m.SourceMatchID) === sid) || null;
}

function isManualBinding(binding) {
  return String(binding?.binding_source ?? "").toLowerCase() === BINDING_SOURCE.MANUAL;
}

function matchContext(platform, match) {
  const sourceGameId = match.SourceGameID ?? match.GameID;
  const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
  const { Game, GameID } = resolveClientGame(platform, sourceGameId);
  const homeId = resolvePlatformTeamId(platform, match.HomeID, sourceGameId, gameCode);
  const awayId = resolvePlatformTeamId(platform, match.AwayID, sourceGameId, gameCode);
  return { Game, GameID, gameCode, homeId, awayId };
}

function canonicalIdKeyForMatch(platform, match) {
  const { GameID, gameCode, homeId, awayId } = matchContext(platform, match);
  const ck = canonicalMatchKeyByIdOnly(
    GameID,
    match.Home,
    match.Away,
    gameCode,
    { provider: platform, homeId, awayId },
  );
  return ck?.key || null;
}

function canonicalNameKeyForMatch(platform, match) {
  const { GameID } = matchContext(platform, match);
  const ck = canonicalMatchKeyByName(GameID, match.Home, match.Away);
  return ck?.mergeKey || null;
}

function eventHasPlatformSlot(bindingsByEvent, eventId, platform, sourceMatchId) {
  const list = bindingsByEvent.get(eventId) || [];
  return list.some(b => b.platform === platform && String(b.source_match_id) !== String(sourceMatchId));
}

function buildEventKeyIndexes(bindings, matches) {
  const bindingsByEvent = new Map();
  const idKeyToEvent = new Map();
  const nameKeyToEvent = new Map();

  for (const b of bindings || []) {
    const eid = Number(b.event_id);
    if (!Number.isFinite(eid))
      continue;
    if (!bindingsByEvent.has(eid))
      bindingsByEvent.set(eid, []);
    bindingsByEvent.get(eid).push(b);

    const m = findPlatformMatch(matches, b.platform, b.source_match_id);
    if (!m)
      continue;

    const idKey = canonicalIdKeyForMatch(b.platform, m);
    if (idKey && !idKeyToEvent.has(idKey))
      idKeyToEvent.set(idKey, eid);

    const nameKey = canonicalNameKeyForMatch(b.platform, m);
    if (nameKey && !nameKeyToEvent.has(nameKey))
      nameKeyToEvent.set(nameKey, eid);
  }

  return { bindingsByEvent, idKeyToEvent, nameKeyToEvent };
}

function listUnboundPlatformMatches(matches, boundKeys) {
  const out = [];
  for (const [platform, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object")
      continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID)
        continue;
      const key = bindingKey(platform, match.SourceMatchID);
      if (!boundKeys.has(key))
        out.push({ platform, match, key });
    }
  }
  return out;
}

function buildObEventStub(platform, match) {
  const { Game, GameID } = matchContext(platform, match);
  const sid = String(match.SourceMatchID);
  return {
    mergeKey: `registry:OB:${sid}`,
    title: formatTitle(match.Home, match.Away),
    game: Game,
    game_id: GameID,
    start_time: normalizeEpochMs(match.StartTime),
    bo: Number(match.BO) || 0,
    event_anchor: `OB:${sid}`,
    pairing_tier: "staging",
    pairing_confidence: 0.5,
    matchs: { OB: sid },
  };
}

/**
 * 纯函数：从未绑定场次生成待写入的 binding 草案（可单测）。
 */
function planAutoBindings({ matches, existingBindings }) {
  const normalized = normalizeMatchesShape(matches);
  const boundKeys = new Set(
    (existingBindings || []).map(b => bindingKey(b.platform, b.source_match_id)),
  );
  const manualKeys = new Set(
    (existingBindings || []).filter(isManualBinding).map(b => bindingKey(b.platform, b.source_match_id)),
  );

  const { bindingsByEvent, idKeyToEvent, nameKeyToEvent } = buildEventKeyIndexes(
    existingBindings,
    normalized,
  );

  const planned = [];
  const plannedKeys = new Set();
  const obSeeds = [];
  const stats = { obSeeded: 0, attachedById: 0, attachedByName: 0, skippedManual: 0 };

  function addBinding(draft) {
    const key = bindingKey(draft.platform, draft.source_match_id);
    if (boundKeys.has(key) || manualKeys.has(key) || plannedKeys.has(key))
      return false;
    planned.push(draft);
    plannedKeys.add(key);
    boundKeys.add(key);
    return true;
  }

  const unbound = listUnboundPlatformMatches(normalized, boundKeys);

  for (const { platform, match } of unbound) {
    if (platform !== "OB")
      continue;
    const stub = buildObEventStub(platform, match);
    obSeeds.push(stub);
    if (addBinding({
      platform,
      source_match_id: String(match.SourceMatchID),
      merge_key: stub.mergeKey,
      binding_source: BINDING_SOURCE.AUTO_ID,
      binding_confidence: 0.92,
      binding_side_mode: "aligned",
      event_stub: stub,
    }))
      stats.obSeeded++;
  }

  for (const { platform, match } of unbound) {
    if (platform === "OB")
      continue;

    const idKey = canonicalIdKeyForMatch(platform, match);
    if (idKey) {
      const eventId = idKeyToEvent.get(idKey);
      if (eventId != null && !eventHasPlatformSlot(bindingsByEvent, eventId, platform, match.SourceMatchID)) {
        if (addBinding({
          platform,
          source_match_id: String(match.SourceMatchID),
          event_id: eventId,
          binding_source: BINDING_SOURCE.AUTO_ID,
          binding_confidence: 0.93,
          binding_side_mode: "aligned",
        }))
          stats.attachedById++;
        continue;
      }
    }

    const nameKey = canonicalNameKeyForMatch(platform, match);
    if (!nameKey)
      continue;
    const eventId = nameKeyToEvent.get(nameKey);
    if (eventId == null || eventHasPlatformSlot(bindingsByEvent, eventId, platform, match.SourceMatchID))
      continue;

    const refBinding = (bindingsByEvent.get(eventId) || [])[0];
    const refMatch = refBinding
      ? findPlatformMatch(normalized, refBinding.platform, refBinding.source_match_id)
      : null;
    if (refMatch && !startTimesCompatible(match.StartTime, refMatch.StartTime))
      continue;

    if (addBinding({
      platform,
      source_match_id: String(match.SourceMatchID),
      event_id: eventId,
      binding_source: BINDING_SOURCE.AUTO_NAME,
      binding_confidence: 0.78,
      binding_side_mode: "aligned",
    }))
      stats.attachedByName++;
  }

  return { planned, obSeeds, stats, boundKeys };
}

async function applyAutoBindingPlan(adapter, plan) {
  const now = Date.now();
  let eventsWritten = 0;
  let bindingsWritten = 0;

  for (const draft of plan.planned) {
    if (draft.event_stub) {
      const stub = draft.event_stub;
      const eventId = await ensureClientMatchId(adapter, stub.mergeKey, {
        title: stub.title,
        game: stub.game,
        game_id: stub.game_id,
        start_time: stub.start_time,
        bo: stub.bo,
        matchs: stub.matchs,
      });
      draft.event_id = eventId;
      const ev = await upsertMatchEvents([{
        id: eventId,
        title: stub.title,
        game: stub.game,
        game_id: stub.game_id,
        start_time: stub.start_time,
        bo: stub.bo,
        pairing_tier: stub.pairing_tier,
        pairing_confidence: stub.pairing_confidence,
        event_anchor: stub.event_anchor,
        built_at: now,
      }]);
      eventsWritten += ev.updated ?? 0;
    }

    if (!Number.isFinite(Number(draft.event_id)))
      continue;

    const write = await upsertEventBindings([{
      platform: draft.platform,
      source_match_id: draft.source_match_id,
      event_id: Number(draft.event_id),
      binding_confidence: draft.binding_confidence,
      binding_source: draft.binding_source,
      binding_side_mode: draft.binding_side_mode || "aligned",
      bound_at: now,
    }]);
    bindingsWritten += write.updated ?? 0;
  }

  return { eventsWritten, bindingsWritten };
}

async function autoBindUnboundPlatformMatches({ matches, adapter, existingBindings }) {
  const plan = planAutoBindings({ matches, existingBindings });
  if (!plan.planned.length)
    return { ...plan.stats, eventsWritten: 0, bindingsWritten: 0 };

  const write = await applyAutoBindingPlan(adapter, plan);
  return { ...plan.stats, ...write };
}

/**
 * Event-first 准备：platform 回写真相表 → 自动绑未绑定场次。
 */
async function prepareRegistryBeforeMaterialize({ matches, adapter }) {
  const reconcile = await reconcilePlatformMatchesFromRegistry();
  const existingBindings = await fetchAllEventBindings();
  const autoBind = await autoBindUnboundPlatformMatches({
    matches,
    adapter,
    existingBindings,
  });
  if (autoBind.bindingsWritten > 0)
    await reconcilePlatformMatchesFromRegistry();

  return { reconcile, autoBind };
}

/**
 * fallback merge 产生的新槽位写入真相表（不覆盖 manual / 已有 binding）。
 */
async function ingestNewBindingsFromPublishedRows({ publishedRows, matches, existingBindings }) {
  const boundKeys = new Set(
    (existingBindings || []).map(b => bindingKey(b.platform, b.source_match_id)),
  );
  const fresh = collectBindingsForRows(publishedRows, matches)
    .filter(b => !boundKeys.has(bindingKey(b.platform, b.source_match_id)))
    .map(b => ({
      platform: b.platform,
      source_match_id: b.source_match_id,
      event_id: Number(b.match_id),
      binding_confidence: b.binding_confidence,
      binding_source: b.binding_source,
      binding_side_mode: b.binding_side_mode,
      bound_at: b.bound_at,
    }));

  if (!fresh.length)
    return { updated: 0 };

  return upsertEventBindings(fresh);
}

export {
  autoBindUnboundPlatformMatches,
  bindingKey,
  ingestNewBindingsFromPublishedRows,
  planAutoBindings,
  prepareRegistryBeforeMaterialize,
};
