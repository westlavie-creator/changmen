/**
 * Sources / Reverse 投影。不经 accumulate；直接从 platform_bets 取 native。
 *
 * 禁止 Map0→任意局盘回填：缺原生地图盘就 omit，勿用全场冒充。
 * 仅当 Round===BO 时用 Map0 作为决胜局的投影输入（只 swap 一次）。
 */
import { parseTitleTeams } from "@changmen/match-engine/teams/match_utils.js";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog";
import { rawSourceForMap } from "../normalize/native_bets.js";
import { resolveRowStructure } from "../structure/resolve_structure.js";
import { swapBetSource } from "../util/swap.js";
import {
  findPlatformMatch,
  resolveOrientationLock,
  sideModeAgainstLock,
} from "./orientation_lock.js";

export function normalizeOverrideMode(overrideMode) {
  if (overrideMode == null || overrideMode === "")
    return undefined;
  if (typeof overrideMode === "string") {
    const s = overrideMode.trim();
    if (s === "force_aligned" || s === "force_reversed")
      return s;
    return undefined;
  }
  if (typeof overrideMode === "object" && overrideMode.mode != null)
    return normalizeOverrideMode(overrideMode.mode);
  return undefined;
}

export function applyOverride(autoMode, overrideMode) {
  const ov = normalizeOverrideMode(overrideMode);
  if (ov === "force_reversed")
    return "reversed";
  if (ov === "force_aligned") {
    if (autoMode === "reversed")
      return "reversed";
    if (autoMode === "ambiguous")
      return "ambiguous";
    return "aligned";
  }
  return autoMode;
}

export function betHasOdds(src) {
  if (!src || typeof src !== "object")
    return false;
  return Boolean(String(src.HomeID ?? "").trim() || String(src.AwayID ?? "").trim());
}

export function projectPlatformSource({
  platform,
  pm,
  raw,
  homeGb,
  awayGb,
  overrideMode,
  lockNames,
}) {
  if (!betHasOdds(raw) || !homeGb || !awayGb) {
    return { mode: "omit", source: null, inReverse: false, omitReason: "no_raw_or_lock" };
  }
  const autoMode = sideModeAgainstLock(platform, pm, homeGb, awayGb, lockNames);
  const ov = normalizeOverrideMode(overrideMode);
  const mode = applyOverride(autoMode, ov);
  if (mode === "ambiguous") {
    return {
      mode: "ambiguous",
      source: null,
      inReverse: false,
      omitReason: autoMode === "ambiguous" && ov === "force_aligned"
        ? "ambiguous_ignore_force_aligned"
        : "ambiguous",
    };
  }
  const needSwap = mode === "reversed";
  const projected = needSwap ? swapBetSource(raw) : { ...raw };
  const expectHome = needSwap ? String(raw.AwayID ?? "") : String(raw.HomeID ?? "");
  const expectAway = needSwap ? String(raw.HomeID ?? "") : String(raw.AwayID ?? "");
  if (String(projected.HomeID ?? "") !== expectHome || String(projected.AwayID ?? "") !== expectAway) {
    return { mode: "omit", source: null, inReverse: false, omitReason: "i1_structure" };
  }
  if (!String(expectHome).trim() || !String(expectAway).trim()) {
    return { mode: "omit", source: null, inReverse: false, omitReason: "missing_ids" };
  }
  return { mode, source: projected, inReverse: needSwap };
}

/** 按赛制层给出的 periods 铺 Bets 行，保留同 Map 的既有行 */
function ensureBetShells(row, periods) {
  const existing = new Map((row.Bets || []).map(b => [Number(b.Map) || 0, b]));
  row.Bets = periods.map(mapNum => existing.get(mapNum) || { Map: mapNum, Sources: {} });
}

export function projectClientMatchSides(row, {
  matches,
  bets,
  existingRow,
  platformOverrides = {},
  forceReanchorOrientation = false,
  stickyOrientation,
} = {}) {
  const structure = row._periods
    ? { deciderMap: Number(row._deciderMap) || 0, periods: row._periods }
    : resolveRowStructure(row, { matches, bets });
  const deciderMap = structure.deciderMap;
  ensureBetShells(row, structure.periods);

  const lock = resolveOrientationLock(row, matches, existingRow, {
    forceReanchorOrientation,
    stickyOrientation,
  });
  const overrides = platformOverrides[Number(row.ID)]
    || platformOverrides[row.ID]
    || platformOverrides[String(row.ID)]
    || {};

  if (!lock.locked) {
    row.Reverse = [];
    for (const bet of row.Bets || [])
      bet.Sources = {};
    delete row.SideAlignAmbiguous;
    return { reverse: [], omitted: [], locked: false, lockSource: lock.lockSource };
  }

  const { homeGb, awayGb } = lock;
  /** 锁朝向的队名快照：team-resolver 不可用时，队名兜底的唯一免插件来源 */
  const lockNames = parseTitleTeams(row.Title) || undefined;
  const reverse = [];
  const omitted = [];
  const ambiguous = [];
  /** 已投影的 Map0 Source：决胜局复用它，中间局仅用于区分 omit 原因 */
  const map0Projected = {};

  const orderedBets = [...(row.Bets || [])].sort(
    (a, b) => (Number(a.Map) || 0) - (Number(b.Map) || 0),
  );

  for (const bet of orderedBets) {
    const mapNum = Number(bet.Map) || 0;
    const nextSources = {};
    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      /** 决胜局：全场盘语义上即该局盘。Map0 已投影过，直接复用，不再二次 swap */
      const useMap0AsDecider = () => {
        if (mapNum === 0 || mapNum !== deciderMap)
          return false;
        const src = map0Projected[platform];
        if (!betHasOdds(src))
          return false;
        nextSources[platform] = { ...src };
        return true;
      };

      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm) {
        omitted.push({ platform, map: mapNum, reason: "no_pm" });
        continue;
      }
      const gameCode = getGameCodeForPlatformId(platform, pm.SourceGameID ?? pm.GameID);
      const raw = rawSourceForMap(platform, sourceMatchId, mapNum, bets, gameCode);

      // 局盘无原生赔率：禁止用 Map0 全场冒充（决胜局除外）
      if (!betHasOdds(raw) && mapNum !== 0) {
        if (useMap0AsDecider())
          continue;
        if (betHasOdds(map0Projected[platform])) {
          omitted.push({ platform, map: mapNum, reason: "no_map0_fallback_on_map_line" });
        }
        else {
          omitted.push({ platform, map: mapNum, reason: "no_native_map_odds" });
        }
        continue;
      }

      const r = projectPlatformSource({
        platform,
        pm,
        raw,
        homeGb,
        awayGb,
        overrideMode: overrides[platform],
        lockNames,
      });
      if (!r.source) {
        if (r.mode === "ambiguous")
          ambiguous.push(platform);
        if (useMap0AsDecider())
          continue;
        omitted.push({ platform, map: mapNum, reason: r.omitReason || r.mode });
        continue;
      }
      nextSources[platform] = r.source;
      if (mapNum === 0)
        map0Projected[platform] = r.source;
      if (r.inReverse && !reverse.includes(platform))
        reverse.push(platform);
    }
    bet.Sources = nextSources;
    const parts = String(row.Title || "").split(/\s+vs\s+/i);
    if (parts.length >= 2) {
      bet.HomeName = parts[0].trim();
      bet.AwayName = parts.slice(1).join(" vs ").trim();
    }
  }

  const platformsWithSources = new Set();
  for (const bet of row.Bets || []) {
    for (const p of Object.keys(bet.Sources || {}))
      platformsWithSources.add(p);
  }
  row.Reverse = reverse.filter(p => platformsWithSources.has(p));
  if (ambiguous.length)
    row.SideAlignAmbiguous = [...new Set(ambiguous)];
  else
    delete row.SideAlignAmbiguous;

  return {
    reverse: row.Reverse,
    omitted,
    locked: true,
    homeGb,
    awayGb,
    lockSource: lock.lockSource,
  };
}

export function projectList(list, ctx) {
  const existingById = new Map(
    (ctx.existingClientRows || []).map(r => [Number(r.id ?? r.ID), r]),
  );
  const stats = { locked: 0, unlocked: 0, omitEvents: 0, reanchored: 0 };
  for (const row of list || []) {
    const result = projectClientMatchSides(row, {
      ...ctx,
      existingRow: existingById.get(Number(row.ID)),
    });
    row._lockSource = result.lockSource || row._lockAnchor || null;
    row._omitEvents = result.omitted || [];
    if (result.locked)
      stats.locked += 1;
    else
      stats.unlocked += 1;
    stats.omitEvents += result.omitted?.length || 0;
    const src = String(result.lockSource || "");
    if (src.startsWith("reanchor") || src.startsWith("upgrade"))
      stats.reanchored += 1;
  }
  return stats;
}
