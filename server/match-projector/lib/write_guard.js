/**
 * 与 matcher / embedded composer 写库互斥。
 * 生产唯一 writer = MATCHER_WRITER=composer（esport 内嵌）；独立 projector WRITE 默认拒绝。
 */
import {
  isMatcherRunning,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
} from "../../matcher/lib/heartbeat.js";
import { isComposerWriter } from "../../matcher/lib/matcher_writer.js";

export function isForceWriteEnabled() {
  return String(process.env.MATCH_PROJECTOR_FORCE_WRITE || "").trim() === "1";
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string, heartbeat?: object }}
 */
export function assertProjectorMayWrite() {
  if (isForceWriteEnabled())
    return { ok: true };

  if (isComposerWriter()) {
    return {
      ok: false,
      reason: "MATCHER_WRITER=composer（生产标准）：拒绝独立 match-projector WRITE。"
        + " 合场已由 esport 内嵌 composer 写库；应急可设 MATCH_PROJECTOR_FORCE_WRITE=1（危险）",
    };
  }

  const raw = readMatcherHeartbeat();
  const hb = sanitizeMatcherHeartbeat(raw);
  if (isMatcherRunning(hb)) {
    return {
      ok: false,
      reason: "matcher 心跳仍活跃，拒绝双写 client_matches。"
        + " 请先停 matcher，或设 MATCH_PROJECTOR_FORCE_WRITE=1（危险）",
      heartbeat: hb,
    };
  }
  return { ok: true };
}
