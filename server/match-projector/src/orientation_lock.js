/**
 * 场次主客锁：PM → OB → RAY → PredictFun（后者仅兜底）可建锁。
 * 禁止 gb id min/max；禁止采信旧 finalize 写在 row 上的脏锁。
 *
 * 时序（各馆陆续到库）：
 * - 最高可用锚点决定「应有」方向；后到的更高优先级锚点会 upgrade 左右
 * - 锚点本 tick 暂时缺失时，RDS 锁 sticky（防闪断清空）
 * - MATCH_PROJECTOR_STICKY_ORIENTATION=1 可强制保留 RDS 左右（即使与最高锚点翻转）
 */
import {
  lookupCanonicalTeamName,
  lookupGbTeamIdByPlatform,
  normalizeTeam,
  parseTitleTeams,
} from "@changmen/match-engine";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog";

/** 这些平台可确立 home_gb / away_gb（顺序 = 优先级；PredictFun 最后） */
export const LOCK_ANCHOR_PLATFORMS = ["Polymarket", "OB", "RAY", "PredictFun"];

function parseLockedGb(value) {
  if (value == null || value === "")
    return null;
  const s = String(value).trim();
  return s || null;
}

function findPlatformMatch(matches, platform, sourceMatchId) {
  const bucket = matches?.[platform];
  if (!bucket || sourceMatchId == null)
    return null;
  const sid = String(sourceMatchId);
  return bucket[sid] || Object.values(bucket).find(m => String(m.SourceMatchID) === sid) || null;
}

function resolveGameCode(row, matches) {
  for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
    const pm = findPlatformMatch(matches, platform, sourceMatchId);
    if (!pm)
      continue;
    const sourceGameId = pm.SourceGameID ?? pm.GameID;
    const code = getGameCodeForPlatformId(platform, sourceGameId);
    if (code)
      return code;
  }
  return null;
}

function teamIdsFromPm(platform, pm) {
  const sourceGameId = pm.SourceGameID ?? pm.GameID;
  const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
  const homeId = String(pm.HomeID ?? pm.home_id ?? pm.SourceHomeID ?? "").trim();
  const awayId = String(pm.AwayID ?? pm.away_id ?? pm.SourceAwayID ?? "").trim();
  const homeGb = homeId ? parseLockedGb(lookupGbTeamIdByPlatform(platform, homeId)) : null;
  const awayGb = awayId ? parseLockedGb(lookupGbTeamIdByPlatform(platform, awayId)) : null;
  return { homeGb, awayGb, homeId, awayId, gameCode };
}

/**
 * 从 Matchs 上取第一个锁锚点平台的 native 主客 gb。
 * Matchs 已关联但 matches 桶尚未到库 → 跳过该馆，试下一优先级。
 * @returns {{ homeGb: string, awayGb: string, anchorPlatform: string } | null}
 */
export function pickLockFromAnchors(matchs, matches) {
  for (const platform of LOCK_ANCHOR_PLATFORMS) {
    const sourceMatchId = matchs?.[platform];
    if (sourceMatchId == null || sourceMatchId === "")
      continue;
    const pm = findPlatformMatch(matches, platform, sourceMatchId);
    if (!pm)
      continue;
    const { homeGb, awayGb } = teamIdsFromPm(platform, pm);
    if (!homeGb || !awayGb || homeGb === awayGb)
      continue;
    return { homeGb, awayGb, anchorPlatform: platform };
  }
  return null;
}

/**
 * 返回当前可见的全部锁锚点（按优先级），用于诊断/测试。
 */
export function listAvailableLockAnchors(matchs, matches) {
  const out = [];
  for (const platform of LOCK_ANCHOR_PLATFORMS) {
    const sourceMatchId = matchs?.[platform];
    if (sourceMatchId == null || sourceMatchId === "")
      continue;
    const pm = findPlatformMatch(matches, platform, sourceMatchId);
    if (!pm)
      continue;
    const { homeGb, awayGb } = teamIdsFromPm(platform, pm);
    if (!homeGb || !awayGb || homeGb === awayGb)
      continue;
    out.push({ homeGb, awayGb, anchorPlatform: platform });
  }
  return out;
}

function titleFromLock(homeGb, awayGb, fallbackTitle) {
  const homeName = lookupCanonicalTeamName(homeGb) || parseTitleTeams(fallbackTitle)?.home;
  const awayName = lookupCanonicalTeamName(awayGb) || parseTitleTeams(fallbackTitle)?.away;
  if (!homeName || !awayName)
    return fallbackTitle || "";
  return `${String(homeName).trim()} vs ${String(awayName).trim()}`;
}

/** 同两支队（允许主客翻转） */
export function sameTeamPair(homeA, awayA, homeB, awayB) {
  if (!homeA || !awayA || !homeB || !awayB)
    return false;
  return (homeA === homeB && awayA === awayB)
    || (homeA === awayB && awayA === homeB);
}

function sameOrientation(homeA, awayA, homeB, awayB) {
  return homeA === homeB && awayA === awayB;
}

function applyLock(row, homeGb, awayGb, lockSource, fallbackTitle) {
  row.HomeGbTeamId = homeGb;
  row.AwayGbTeamId = awayGb;
  row.Title = titleFromLock(homeGb, awayGb, fallbackTitle);
  row._lockAnchor = lockSource;
  delete row._clearGbLock;
  return { homeGb, awayGb, locked: true, lockSource };
}

function clearLock(row, matches) {
  row.HomeGbTeamId = undefined;
  row.AwayGbTeamId = undefined;
  row._lockAnchor = null;
  // 写库哨兵：0 → SQL 清空；普通 null 入参仍保留旧锁（保护生产 legacy）
  row._clearGbLock = true;
  for (const platform of [...LOCK_ANCHOR_PLATFORMS, "IA", "PB", "TF"]) {
    const sid = row.Matchs?.[platform];
    if (!sid)
      continue;
    const pm = findPlatformMatch(matches, platform, sid);
    if (!pm)
      continue;
    const home = String(pm.Home ?? pm.home ?? "").trim();
    const away = String(pm.Away ?? pm.away ?? "").trim();
    if (home && away) {
      row.Title = `${home} vs ${away}`;
      break;
    }
  }
  return { homeGb: null, awayGb: null, locked: false, lockSource: null };
}

/**
 * 是否强制保留 RDS 左右（即使与最高锚点翻转）。
 * 默认 false：后到的更高优先级锚点会 upgrade 方向。
 */
export function isStickyOrientationEnabled(opts = {}) {
  if (opts.stickyOrientation === true)
    return true;
  if (opts.stickyOrientation === false)
    return false;
  if (opts.forceReanchorOrientation === true)
    return false;
  return String(process.env.MATCH_PROJECTOR_STICKY_ORIENTATION || "").trim() === "1";
}

/**
 * 解析/刷新一场的主客锁与 Title。
 *
 * @param {object} opts
 * @param {boolean} [opts.forceReanchorOrientation=false] 强制跟最高锚点左右
 * @param {boolean} [opts.stickyOrientation] 覆盖默认：true=保留翻转 sticky
 */
export function resolveOrientationLock(row, matches, existingRow, opts = {}) {
  const forceReanchorOrientation = opts.forceReanchorOrientation === true
    || String(process.env.MATCH_PROJECTOR_REANCHOR || "").trim() === "1";
  const stickyOrientation = isStickyOrientationEnabled({
    ...opts,
    forceReanchorOrientation,
  });

  // 故意不读 row.HomeGbTeamId / AwayGbTeamId（旧 finalize / min/max 可能已污染）
  const existingHome = parseLockedGb(existingRow?.home_gb_team_id ?? existingRow?.HomeGbTeamId);
  const existingAway = parseLockedGb(existingRow?.away_gb_team_id ?? existingRow?.AwayGbTeamId);
  const anchor = pickLockFromAnchors(row.Matchs, matches);
  const fallbackTitle = row.Title || existingRow?.title;

  if (existingHome && existingAway && existingHome !== existingAway) {
    if (anchor) {
      if (!sameTeamPair(existingHome, existingAway, anchor.homeGb, anchor.awayGb)) {
        // 队对都对不上：脏锁 / 错误连线 → 跟最高锚点
        return applyLock(
          row,
          anchor.homeGb,
          anchor.awayGb,
          `reanchor:${anchor.anchorPlatform}`,
          fallbackTitle,
        );
      }

      const orientDiffers = !sameOrientation(
        existingHome,
        existingAway,
        anchor.homeGb,
        anchor.awayGb,
      );

      // 默认：最高可用锚点方向为准（修 RAY 先到、OB/PM 后到的 sticky 错向）
      if (orientDiffers && (forceReanchorOrientation || !stickyOrientation)) {
        return applyLock(
          row,
          anchor.homeGb,
          anchor.awayGb,
          `upgrade:${anchor.anchorPlatform}`,
          fallbackTitle,
        );
      }

      return applyLock(row, existingHome, existingAway, "existing", fallbackTitle);
    }

    // 本 tick 无锚点数据：仅当 Matchs 仍挂着 PM/OB/RAY 槽位时 sticky（闪断保锁）
    // 若只剩 IA/PB 等非锚点馆，必须清锁，否则会拿旧锁对非锚点出盘
    const hasAnchorSlot = LOCK_ANCHOR_PLATFORMS.some(
      p => row.Matchs?.[p] != null && row.Matchs[p] !== "",
    );
    if (hasAnchorSlot) {
      return applyLock(row, existingHome, existingAway, "existing-gap", fallbackTitle);
    }
  }

  if (anchor) {
    return applyLock(row, anchor.homeGb, anchor.awayGb, anchor.anchorPlatform, fallbackTitle);
  }

  return clearLock(row, matches);
}

/**
 * 平台相对锁：aligned | reversed | ambiguous
 * 用队伍 venue id → gb，不用盘口 oid。
 */
export function sideModeAgainstLock(platform, pm, homeGb, awayGb) {
  if (!homeGb || !awayGb || !pm)
    return "ambiguous";
  const { homeGb: ph, awayGb: pa } = teamIdsFromPm(platform, pm);
  if (ph && pa) {
    if (ph === homeGb && pa === awayGb)
      return "aligned";
    if (ph === awayGb && pa === homeGb)
      return "reversed";
    return "ambiguous";
  }
  const phN = normalizeTeam(pm.Home ?? pm.home);
  const paN = normalizeTeam(pm.Away ?? pm.away);
  const ch = normalizeTeam(lookupCanonicalTeamName(homeGb) || "");
  const ca = normalizeTeam(lookupCanonicalTeamName(awayGb) || "");
  if (!phN || !paN || !ch || !ca)
    return "ambiguous";
  if (phN === ch && paN === ca)
    return "aligned";
  if (phN === ca && paN === ch)
    return "reversed";
  return "ambiguous";
}

export {
  findPlatformMatch,
  parseLockedGb,
  resolveGameCode,
  teamIdsFromPm,
  titleFromLock,
};
