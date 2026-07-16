/**
 * 主客投影：锁 + native raw → Sources + Reverse。
 * I1：Sources 必须等于 needSwap ? swap(raw) : raw（结构校验，不用 odds→gb）。
 * Reverse 仅含实际写出 Sources 且做过 swap 的平台。
 * Promote：局盘无 native 时从已投影 Map0 回填（禁止二次 swap / 二次 override）。
 */
import { swapBetSource } from "@changmen/match-engine";
import {
  findPlatformMatch,
  resolveOrientationLock,
  sideModeAgainstLock,
} from "./orientation_lock.js";

/**
 * DB/连线可能给 string，或偶发 { mode }；统一成 force_* | undefined。
 */
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

/**
 * force_aligned：reversed → 忽略（仍 reverse）；ambiguous → 仍 ambiguous（禁止强行出盘）
 */
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

/**
 * @returns {{
 *   mode: string,
 *   source: object|null,
 *   inReverse: boolean,
 *   omitReason?: string,
 * }}
 */
export function projectPlatformSource({
  platform,
  pm,
  raw,
  homeGb,
  awayGb,
  overrideMode,
}) {
  if (!betHasOdds(raw) || !homeGb || !awayGb) {
    return { mode: "omit", source: null, inReverse: false, omitReason: "no_raw_or_lock" };
  }

  const autoMode = sideModeAgainstLock(platform, pm, homeGb, awayGb);
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

  // I1：投影结果必须是 raw 的正确侧
  const expectHome = needSwap ? String(raw.AwayID ?? "") : String(raw.HomeID ?? "");
  const expectAway = needSwap ? String(raw.HomeID ?? "") : String(raw.AwayID ?? "");
  if (String(projected.HomeID ?? "") !== expectHome || String(projected.AwayID ?? "") !== expectAway) {
    return { mode: "omit", source: null, inReverse: false, omitReason: "i1_structure" };
  }
  if (!String(expectHome).trim() || !String(expectAway).trim()) {
    return { mode: "omit", source: null, inReverse: false, omitReason: "missing_ids" };
  }

  return {
    mode,
    source: projected,
    inReverse: needSwap,
  };
}

function cloneRawSource(src) {
  if (!src)
    return null;
  return {
    Type: src.Type,
    BetID: String(src.BetID ?? ""),
    HomeID: String(src.HomeID ?? ""),
    AwayID: String(src.AwayID ?? ""),
    HomeOdds: src.HomeOdds,
    AwayOdds: src.AwayOdds,
    Status: src.Status || "Normal",
  };
}

/**
 * 从 accumulate / platform_bets 取某馆某 Map 的 native Sources。
 */
function rawSourceForMap(platform, pm, mapNum, bets, timers, sourceFromBet, buildAccumulateRow) {
  if (!pm || !buildAccumulateRow)
    return null;
  const acc = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
  const bet = (acc.Bets || []).find(b => (Number(b.Map) || 0) === (Number(mapNum) || 0));
  return cloneRawSource(bet?.Sources?.[platform]);
}

export function betHasOdds(src) {
  if (!src || typeof src !== "object")
    return false;
  const h = String(src.HomeID ?? "").trim();
  const a = String(src.AwayID ?? "").trim();
  return Boolean(h || a);
}

/**
 * 对一场 client match 重投影所有 Map 的 Sources + Reverse。
 * 清空旧 Sources 再填，禁止残留。
 */
export function projectClientMatchSides(row, {
  matches,
  bets,
  timers,
  sourceFromBet,
  buildAccumulateRow,
  existingRow,
  platformOverrides = {},
  forceReanchorOrientation = false,
  stickyOrientation,
} = {}) {
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
  const reverse = [];
  const omitted = [];
  const ambiguous = [];
  /** @type {Record<string, object>} 已投影 Map0，供局盘 promote */
  const map0Projected = {};
  /** Map0 已写入 Reverse 的平台 — promote 只复制，不再二次判向 */
  const map0InReverse = new Set();

  const orderedBets = [...(row.Bets || [])].sort(
    (a, b) => (Number(a.Map) || 0) - (Number(b.Map) || 0),
  );

  for (const bet of orderedBets) {
    const mapNum = Number(bet.Map) || 0;
    const nextSources = {};
    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm) {
        omitted.push({ platform, map: mapNum, reason: "no_pm" });
        continue;
      }

      const raw = rawSourceForMap(
        platform,
        pm,
        mapNum,
        bets,
        timers,
        sourceFromBet,
        buildAccumulateRow,
      );

      // 局盘无 native：原样复制已投影 Map0（禁止再 swap / 再 applyOverride）
      if (!betHasOdds(raw) && mapNum !== 0 && betHasOdds(map0Projected[platform])) {
        nextSources[platform] = cloneRawSource(map0Projected[platform]);
        if (map0InReverse.has(platform) && !reverse.includes(platform))
          reverse.push(platform);
        continue;
      }

      const r = projectPlatformSource({
        platform,
        pm,
        raw,
        homeGb,
        awayGb,
        overrideMode: overrides[platform],
      });
      if (!r.source) {
        omitted.push({ platform, map: mapNum, reason: r.omitReason || r.mode });
        if (r.mode === "ambiguous")
          ambiguous.push(platform);
        continue;
      }
      nextSources[platform] = r.source;
      if (mapNum === 0) {
        map0Projected[platform] = r.source;
        if (r.inReverse)
          map0InReverse.add(platform);
      }
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

  // Reverse 仅保留实际仍有 Sources 的平台（Map 级遗漏不应挂空 Reverse）
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

/**
 * 批量重投影 merge 产出的 list。
 */
export function reprojectClientMatchList(list, ctx) {
  const existingById = new Map(
    (ctx.existingClientRows || []).map(r => [Number(r.id ?? r.ID), r]),
  );
  const stats = {
    locked: 0,
    unlocked: 0,
    omitEvents: 0,
    reanchored: 0,
  };
  for (const row of list || []) {
    const existing = existingById.get(Number(row.ID));
    const result = projectClientMatchSides(row, { ...ctx, existingRow: existing });
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
