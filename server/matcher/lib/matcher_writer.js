/**
 * 写路径选型（生产标准 = composer）。
 *
 * MATCHER_WRITER=composer（默认）→ matchMergeOnce 整段交给 @changmen/match-composer
 * MATCHER_WRITER=legacy → 旧 computeMatchMergeList + finalize（仅显式回滚）
 *
 * 与 MATCHER_SIDE_ENGINE=projector（仅 legacy）互斥：composer 优先，忽略 projector。
 */
export function getMatcherWriter() {
  const v = String(process.env.MATCHER_WRITER || "composer").trim().toLowerCase();
  if (v === "legacy" || v === "old" || v === "match-merge")
    return "legacy";
  if (v === "composer" || v === "match-composer" || v === "")
    return "composer";
  // 未知值保守走 composer（与生产一致），避免误回 legacy
  return "composer";
}

export function isComposerWriter() {
  return getMatcherWriter() === "composer";
}

export function isLegacyWriter() {
  return getMatcherWriter() === "legacy";
}
