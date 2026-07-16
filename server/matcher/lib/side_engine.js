/**
 * 主客投影引擎开关（仅 MATCHER_WRITER=legacy 时生效）。
 * MATCHER_SIDE_ENGINE=projector → matchMergeOnce 写库前用 match-projector 覆写锁/Sources/Reverse
 * 默认 legacy → 沿用 finalize 的 reconcile（旧行为）
 *
 * 完整从零合场请用 MATCHER_WRITER=composer（见 matcher_writer.js）。
 */
export function getMatcherSideEngine() {
  const v = String(process.env.MATCHER_SIDE_ENGINE || "legacy").trim().toLowerCase();
  if (v === "projector" || v === "project")
    return "projector";
  return "legacy";
}

export function isProjectorSideEngine() {
  return getMatcherSideEngine() === "projector";
}
