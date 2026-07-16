/**
 * 与旧 matcher 写库互斥：matcher 心跳仍活跃时拒绝 WRITE。
 */
import {
  isMatcherRunning,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
} from "../../matcher/lib/heartbeat.js";

export function isForceWriteEnabled() {
  return String(process.env.MATCH_PROJECTOR_FORCE_WRITE || "").trim() === "1";
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string, heartbeat?: object }}
 */
export function assertProjectorMayWrite() {
  if (isForceWriteEnabled())
    return { ok: true };

  const raw = readMatcherHeartbeat();
  const hb = sanitizeMatcherHeartbeat(raw);
  if (isMatcherRunning(hb)) {
    return {
      ok: false,
      reason: "旧 matcher 心跳仍活跃，拒绝双写 client_matches。"
        + " 请先停 matcher，或设 MATCH_PROJECTOR_FORCE_WRITE=1（危险）",
      heartbeat: hb,
    };
  }
  return { ok: true };
}
