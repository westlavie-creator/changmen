/**
 * Event-first：自动写 event_bindings（不覆盖 manual）。启发式 merge 仅用于提议 binding，不直接发布 client 行。
 */

import {
  fetchAllEventBindings,
  reconcilePlatformMatchesFromRegistry,
  upsertEventBindings,
  upsertMatchEvents,
} from "@changmen/db";
import {
  buildMatchListMerged,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  ensureClientMatchId,
  MIN_CLIENT_MATCH_PLATFORMS,
  normalizeMatchesShape,
} from "@changmen/match-engine";
import { getGameCodeForPlatformId, resolveClientGame } from "@changmen/shared/catalog/game_catalog";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";
import { formatTitle } from "@changmen/match-engine/teams/match_utils.js";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { startTimesCompatible } from "@changmen/match-engine";
import { BINDING_SOURCE } from "./pairing_metadata.js";

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

function eventHasPlatformSlot(bindingsByEvent, eventId, platform) {
  const list = bindingsByEvent.get(eventId) || [];
  return list.some(b => b.platform === platform);
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

function filterUnboundMatches(matches, boundKeys) {
  const out = {};
  for (const [platform, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object")
      continue;
    for (const [sid, match] of Object.entries(byId)) {
      if (boundKeys.has(bindingKey(platform, sid)))
        continue;
      if (!out[platform])
        out[platform] = {};
      out[platform][sid] = match;
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

function buildEventStubFromMergeRow(row) {
  const anchorEntry = Object.entries(row.Matchs || {}).find(([p]) => p === "OB")
    || Object.entries(row.Matchs || {})[0];
  const anchor = anchorEntry ? `${anchorEntry[0]}:${anchorEntry[1]}` : "unknown";
  return {
    mergeKey: `registry:merge:${String(row.MergeKey || anchor)}`,
    title: String(row.Title || ""),
    game: row.Game != null ? String(row.Game) : "",
    game_id: row.GameID != null ? String(row.GameID) : "",
    start_time: Number(row.StartTime) || 0,
    bo: Number(row.BO) || 0,
    event_anchor: anchor,
    pairing_tier: row.MergeBasis === "id" ? "provisional" : "provisional",
    pairing_confidence: row.MergeBasis === "id" ? 0.9 : 0.75,
    matchs: { ...(row.Matchs || {}) },
  };
}

/**
 * @param {'ob'|'attach'|'all'} [phase]
 */
function planAutoBindings({ matches, existingBindings, phase = "all" }) {
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
  const stats = { obSeeded: 0, attachedById: 0, attachedByName: 0 };

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

  if (phase === "ob" || phase === "all") {
    for (const { platform, match } of unbound) {
      if (platform !== "OB")
        continue;
      const stub = buildObEventStub(platform, match);
      if (addBinding({
        platform,
        source_match_id: String(match.SourceMatchID),
        binding_source: BINDING_SOURCE.AUTO_ID,
        binding_confidence: 0.92,
        binding_side_mode: "aligned",
        event_stub: stub,
      }))
        stats.obSeeded++;
    }
  }

  if (phase === "attach" || phase === "all") {
    for (const { platform, match } of unbound) {
      if (platform === "OB")
        continue;

      const idKey = canonicalIdKeyForMatch(platform, match);
      if (idKey) {
        const eventId = idKeyToEvent.get(idKey);
        if (eventId != null && !eventHasPlatformSlot(bindingsByEvent, eventId, platform)) {
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
      if (eventId == null || eventHasPlatformSlot(bindingsByEvent, eventId, platform))
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
  }

  return { planned, stats, boundKeys };
}

/**
 * 对仍未绑定的平台子集跑启发式 merge，只产出 binding 提议（不写 client_matches）。
 */
function planMergeHintBindings({ matches, existingBindings, bets, timers, sourceFromBet }) {
  const normalized = normalizeMatchesShape(matches);
  const boundKeys = new Set(
    (existingBindings || []).map(b => bindingKey(b.platform, b.source_match_id)),
  );
  const unbound = filterUnboundMatches(normalized, boundKeys);
  const hasUnbound = Object.values(unbound).some(by => by && Object.keys(by).length);
  if (!hasUnbound)
    return { planned: [], stats: { mergeHints: 0 } };

  const merged = buildMatchListMerged(unbound, bets, timers, sourceFromBet);
  const planned = [];
  let mergeHints = 0;

  for (const row of merged) {
    const slots = Object.entries(row.Matchs || {})
      .filter(([platform, sid]) => !boundKeys.has(bindingKey(platform, sid)));
    if (slots.length < MIN_CLIENT_MATCH_PLATFORMS)
      continue;

    const basis = row.MergeBasis === "id" ? BINDING_SOURCE.AUTO_ID : BINDING_SOURCE.AUTO_NAME;
    const confidence = basis === BINDING_SOURCE.AUTO_ID ? 0.92 : 0.76;

    planned.push({
      group: true,
      event_stub: buildEventStubFromMergeRow(row),
      bindings: slots.map(([platform, source_match_id]) => ({
        platform,
        source_match_id: String(source_match_id),
        binding_source: basis,
        binding_confidence: confidence,
        binding_side_mode: "aligned",
      })),
    });

    for (const [platform, sid] of slots)
      boundKeys.add(bindingKey(platform, sid));
    mergeHints++;
  }

  return { planned, stats: { mergeHints } };
}

async function applyAutoBindingPlan(adapter, plan) {
  const now = Date.now();
  let eventsWritten = 0;
  let bindingsWritten = 0;

  for (const draft of plan.planned || []) {
    if (draft.group) {
      const stub = draft.event_stub;
      const eventId = await ensureClientMatchId(adapter, stub.mergeKey, {
        title: stub.title,
        game: stub.game,
        game_id: stub.game_id,
        start_time: stub.start_time,
        bo: stub.bo,
        matchs: stub.matchs,
      });
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

      for (const b of draft.bindings) {
        const write = await upsertEventBindings([{
          platform: b.platform,
          source_match_id: b.source_match_id,
          event_id: eventId,
          binding_confidence: b.binding_confidence,
          binding_source: b.binding_source,
          binding_side_mode: b.binding_side_mode || "aligned",
          bound_at: now,
        }]);
        bindingsWritten += write.updated ?? 0;
      }
      continue;
    }

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

async function runBindingPhase(adapter, matches, planner, extra = {}) {
  const existingBindings = await fetchAllEventBindings();
  const plan = planner({ matches, existingBindings, ...extra });
  if (!plan.planned?.length)
    return { ...plan.stats, eventsWritten: 0, bindingsWritten: 0 };
  const write = await applyAutoBindingPlan(adapter, plan);
  return { ...plan.stats, ...write };
}

/**
 * Event-first 准备：reconcile → OB seed → attach → merge 提议 binding。
 */
async function prepareRegistryBeforeMaterialize({ matches, adapter, bets, timers, sourceFromBet }) {
  const reconcile = await reconcilePlatformMatchesFromRegistry();

  const ob = await runBindingPhase(adapter, matches, ({ matches: m, existingBindings }) =>
    planAutoBindings({ matches: m, existingBindings, phase: "ob" }));
  if (ob.bindingsWritten > 0)
    await reconcilePlatformMatchesFromRegistry();

  const attach = await runBindingPhase(adapter, matches, ({ matches: m, existingBindings }) =>
    planAutoBindings({ matches: m, existingBindings, phase: "attach" }));

  const mergeHints = await runBindingPhase(adapter, matches, ({ matches: m, existingBindings }) =>
    planMergeHintBindings({ matches: m, existingBindings, bets, timers, sourceFromBet }));

  const finalReconcile = await reconcilePlatformMatchesFromRegistry();

  return {
    reconcile,
    finalReconcile,
    autoBind: {
      obSeeded: ob.obSeeded ?? 0,
      attachedById: attach.attachedById ?? 0,
      attachedByName: attach.attachedByName ?? 0,
      mergeHints: mergeHints.mergeHints ?? 0,
      bindingsWritten: (ob.bindingsWritten ?? 0) + (attach.bindingsWritten ?? 0) + (mergeHints.bindingsWritten ?? 0),
      eventsWritten: (ob.eventsWritten ?? 0) + (attach.eventsWritten ?? 0) + (mergeHints.eventsWritten ?? 0),
    },
  };
}

export {
  bindingKey,
  planAutoBindings,
  planMergeHintBindings,
  prepareRegistryBeforeMaterialize,
};
