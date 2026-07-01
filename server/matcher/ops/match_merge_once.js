import * as db from "@changmen/db";
import {
  buildClientMatchListFromRegistry,
  buildPmSportByClientId,
  filterActiveClientMatches,
  filterMultiPlatformClientMatches,
  normalizeMatchesShape,
  setTeamPlugin,
} from "@changmen/match-engine";
import { publishFilterLabel } from "../lib/config.js";
import { formatOdds } from "@changmen/shared/odds_format";
import { autoRegisterTeams } from "./auto_register_teams.js";
import { backfillPlatformMatchIdsForIdMerges } from "./backfill_platform_match_ids.js";
import { setClientMatchesFromMatchMerge } from "../../backend/core/db/store.js";
import { isEmbeddedMatcher } from "../../backend/core/shared/matcher_mode.js";
import store from "../../backend/core/esport-api/store.js";
import {
  fetchMatcherRdsSnapshot,
  invalidateMatcherRdsSnapshot,
} from "./rds_snapshot_cache.js";
import {
  applyPairingMetadata,
  syncPlatformBindingsForRows,
} from "./pairing_metadata.js";
import { syncEventRegistryForMatchMerge } from "./sync_event_registry.js";
import { reconcileEventRegistryAfterMerge } from "./registry_reconcile.js";
import { prepareRegistryBeforeMaterialize } from "./auto_bind_events.js";
import "../lib/env.js";

/**
 * 单次 matchMerge：event_bindings 真相表 → 物化 client_matches。
 */

let _pluginReady = null;
let _matchMergeInFlight = null;

function resetTeamPluginCache() {
  _pluginReady = null;
}

function invalidateTeamPlugin() {
  resetTeamPluginCache();
}

function sourceFromBet(provider, b) {
  return {
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: formatOdds(b.HomeOdds),
    AwayOdds: formatOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  };
}

async function ensureTeamPlugin() {
  if (_pluginReady)
    return _pluginReady;
  _pluginReady = (async () => {
    try {
      const { loadAndCreatePlugin } = await import("@changmen/team-resolver/team_db.js");
      const plugin = await loadAndCreatePlugin();
      setTeamPlugin(plugin);
    }
    catch (err) {
      console.warn("[matchMerge] team-resolver 加载失败:", err.message);
    }
  })();
  return _pluginReady;
}

async function matchMergeOnceImpl() {
  await db.initLastWrittenIds();

  const { matchesRaw, bets, timers, clientRows, hotCollector } = await fetchMatcherRdsSnapshot();

  const teamReg = await autoRegisterTeams(matchesRaw);
  const nameSync = await db.syncCanonicalTeamNamesFromOb();
  const teamDataChanged = (teamReg?.registered > 0) || (nameSync?.updated > 0);
  if (teamDataChanged)
    resetTeamPluginCache();
  await ensureTeamPlugin();

  const matches = normalizeMatchesShape(matchesRaw);

  if (!db.isMatcherStoreReady()) {
    const { script } = db.getDbMode();
    throw new Error(
      `无法 matchMerge：数据库未配置（GAMEBET_DB_SCRIPT=${script}）。`
      + " 请配置 DATABASE_URL（或 DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL）。",
    );
  }

  const platformSideOverrides = await db.fetchClientMatchPlatformOverrides();
  const adapter = db.getClientMatchIdAdapter();

  const registryPrep = await prepareRegistryBeforeMaterialize({
    matches,
    adapter,
    bets,
    timers,
    sourceFromBet,
  });
  if (registryPrep.autoBind.bindingsWritten > 0)
    invalidateMatcherRdsSnapshot(["platformMatches"]);

  const ab = registryPrep.autoBind;
  if (ab.obSeeded || ab.attachedById || ab.attachedByGb || ab.attachedByName || ab.mergeHints) {
    console.log(
      `[matchMerge] auto-bind ob=${ab.obSeeded} id=${ab.attachedById} gb=${ab.attachedByGb ?? 0}`
      + ` name=${ab.attachedByName} mergeHints=${ab.mergeHints} · bindings+${ab.bindingsWritten ?? 0}`,
    );
  }

  const bindings = await db.fetchAllEventBindings();
  const eventIds = [...new Set(bindings.map(b => Number(b.event_id)).filter(Number.isFinite))];
  const matchEventRows = await db.fetchMatchEventsByIds(eventIds);
  const matchEventsById = new Map(matchEventRows.map(r => [Number(r.id), r]));

  console.log(`[matchMerge] 物化 ${eventIds.length} 赛事 · ${bindings.length} 绑定`);

  let info = buildClientMatchListFromRegistry({
    bindings,
    matchEventsById,
    matches,
    bets,
    timers,
    sourceFromBet,
    platformSideOverrides,
    existingClientRows: clientRows,
  });

  info = filterMultiPlatformClientMatches(info);

  const pmSportByClientId = buildPmSportByClientId(clientRows);
  const endedFilter = filterActiveClientMatches(info, {
    platformMatches: matches,
    timersByProvider: timers,
    pmSportByClientId,
  });
  info = endedFilter.list;
  if (endedFilter.endedCount > 0) {
    console.log(`[matchMerge] 已结束移出活跃列表 ${endedFilter.endedCount} 场`);
  }

  const {
    annotated: pairingAnnotated,
    published: pairingPublished,
  } = applyPairingMetadata(info, matches, {
    lockedTiers: await db.fetchLockedMatchEventTiers(),
  });
  if (pairingPublished.length !== info.length) {
    console.log(
      `[matchMerge] 发布过滤 ${info.length} → ${pairingPublished.length}`
      + `（filter=${publishFilterLabel()}）`,
    );
  }
  info = pairingPublished;

  const now = Date.now();
  const { toDelete: deletedClientMatchIds } = await db.writeClientMatchesAsync(
    info.map(m => ({
      id: Number(m.ID),
      merge_key: m.MergeKey ? String(m.MergeKey) : null,
      title: String(m.Title || ""),
      game: String(m.Game || ""),
      game_id: String(m.GameID || ""),
      start_time: Number(m.StartTime) || 0,
      bo: Number(m.BO) || 0,
      round: Number(m.Round) || 0,
      round_start: Number(m.RoundStart) || 0,
      reverse: Array.isArray(m.Reverse) ? m.Reverse : [],
      matchs: m.Matchs || {},
      bets: m.Bets || [],
      home_gb_team_id: m.HomeGbTeamId ?? null,
      away_gb_team_id: m.AwayGbTeamId ?? null,
      pairing_tier: m.PairingTier ?? null,
      pairing_confidence: m.PairingConfidence ?? null,
      event_anchor: m.EventAnchor ?? null,
      built_at: now,
    })),
  );
  if (isEmbeddedMatcher())
    setClientMatchesFromMatchMerge(info, now);
  store.patchCollectorMatchClientIds(info);
  invalidateMatcherRdsSnapshot(["clientMatches"]);

  const matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);
  if (matchIdBackfill?.updated)
    invalidateMatcherRdsSnapshot(["platformMatches"]);

  const bindingSync = await syncPlatformBindingsForRows(pairingAnnotated, matches);
  if (bindingSync?.updated > 0) {
    console.log(`[matchMerge] platform 绑定元数据 ${bindingSync.updated} 条`);
    invalidateMatcherRdsSnapshot(["platformMatches"]);
  }

  const eventRegistry = await syncEventRegistryForMatchMerge({
    rows: pairingPublished,
    builtAt: now,
    deletedEventIds: deletedClientMatchIds,
  });
  if (!eventRegistry.skipped && (eventRegistry.events || eventRegistry.deleted)) {
    console.log(
      `[matchMerge] match_events sync events=${eventRegistry.events} deleted=${eventRegistry.deleted ?? 0}`,
    );
  }

  let registryReconcile = { skipped: true };
  if (!eventRegistry.skipped) {
    const registryBindings = await db.fetchEventBindingsForEvents(
      pairingPublished.map(r => Number(r.ID)).filter(Number.isFinite),
    );
    registryReconcile = await reconcileEventRegistryAfterMerge({
      publishedRows: pairingPublished,
      registryBindings,
    });
    if (!registryReconcile.skipped) {
      if (registryReconcile.reconcile?.updated > 0) {
        console.log(`[matchMerge] registry→platform 回写 ${registryReconcile.reconcile.updated} 条`);
        invalidateMatcherRdsSnapshot(["platformMatches"]);
      }
      if (registryReconcile.pruned?.deleted > 0) {
        console.log(`[matchMerge] 孤儿 event_bindings 清理 ${registryReconcile.pruned.deleted} 条`);
      }
      if (!registryReconcile.validation?.ok) {
        const n = registryReconcile.validation.mismatches.length;
        console.warn(`[matchMerge] 一致性告警 ${n} 项（首条 event #${registryReconcile.validation.mismatches[0]?.event_id}）`);
      }
    }
  }

  return {
    matchCount: info.length,
    builtAt: now,
    matchIdBackfill,
    bindingSync,
    eventRegistry,
    registryReconcile,
    registryPrep,
    teamReg,
    nameSync,
    hotCollector,
    pairing: {
      annotated: pairingAnnotated.length,
      published: pairingPublished.length,
    },
  };
}

async function matchMergeOnce(opts = {}) {
  if (_matchMergeInFlight) {
    if (opts.afterInFlight) {
      await _matchMergeInFlight;
      return matchMergeOnce();
    }
    return _matchMergeInFlight;
  }
  _matchMergeInFlight = matchMergeOnceImpl().finally(() => {
    _matchMergeInFlight = null;
  });
  return _matchMergeInFlight;
}

export { ensureTeamPlugin, invalidateTeamPlugin, matchMergeOnce, resetTeamPluginCache };
