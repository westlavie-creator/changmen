/**
 * 写路径选型（默认 legacy）。
 *
 * MATCHER_WRITER=composer → matchMergeOnce 整段交给 @changmen/match-composer
 * MATCHER_WRITER=legacy（默认）→ 旧 computeMatchMergeList + finalize 写库
 *
 * 与 MATCHER_SIDE_ENGINE=projector（旧 merge + 投影覆写）互斥：composer 优先。
 * 生产切流前保持默认 legacy。
 */
export function getMatcherWriter() {
  const v = String(process.env.MATCHER_WRITER || "legacy").trim().toLowerCase();
  if (v === "composer" || v === "match-composer")
    return "composer";
  return "legacy";
}

export function isComposerWriter() {
  return getMatcherWriter() === "composer";
}
