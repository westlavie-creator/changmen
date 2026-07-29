/**
 * 主客投影引擎开关（仅 MATCHER_WRITER=legacy 时生效）。
 * MATCHER_SIDE_ENGINE=projector → matchMergeOnce 写库前用 match-projector 覆写锁/Sources/Reverse
 * 默认 legacy → 沿用 finalize 的 reconcile（指 SIDE_ENGINE；MATCHER_WRITER 默认是 composer）
 *
 * 生产唯一 writer = MATCHER_WRITER=composer；此时本开关无效。
 */
import { isComposerWriter } from "./matcher_writer.js";

let _warnedProjectorIgnored = false;

export function getMatcherSideEngine() {
  if (isComposerWriter()) {
    const raw = String(process.env.MATCHER_SIDE_ENGINE || "").trim().toLowerCase();
    if ((raw === "projector" || raw === "project") && !_warnedProjectorIgnored) {
      _warnedProjectorIgnored = true;
      console.error(
        "[matcher] MATCHER_SIDE_ENGINE=projector 在 MATCHER_WRITER=composer 下无效，已忽略。"
        + " 生产唯一写路径为 embedded composer；回滚请显式 MATCHER_WRITER=legacy。",
      );
    }
    return "legacy";
  }
  const v = String(process.env.MATCHER_SIDE_ENGINE || "legacy").trim().toLowerCase();
  if (v === "projector" || v === "project")
    return "projector";
  return "legacy";
}

export function isProjectorSideEngine() {
  return getMatcherSideEngine() === "projector";
}

/** @internal 测试用 */
export function __resetMatcherSideEngineWarnForTests() {
  _warnedProjectorIgnored = false;
}
