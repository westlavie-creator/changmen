/**
 * 写库互斥：
 * - 默认挡 matcher HB + projector WRITE HB + 其它 composer WRITE HB
 * - viaMatcherWriter / skipMatcherHeartbeat：仅跳过「本进程 matcher HB」
 *   （仍挡 projector 与其它 composer）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMatcherRunning,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
} from "../../matcher/lib/heartbeat.js";
import { COMPOSER_HEARTBEAT_PATH } from "./heartbeat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTOR_HB = path.join(__dirname, "../../match-projector/.projector-heartbeat.json");

export function isForceWriteEnabled() {
  return String(process.env.MATCH_COMPOSER_FORCE_WRITE || "").trim() === "1";
}

function heartbeatActive(filePath, { requireWrote = false, maxAgeMs = 90_000 } = {}) {
  try {
    if (!fs.existsSync(filePath))
      return false;
    const hb = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const last = Number(hb.lastRun) || 0;
    if (!(last > 0 && Date.now() - last < maxAgeMs))
      return false;
    if (requireWrote && !hb.wrote)
      return false;
    return hb;
  }
  catch {
    return false;
  }
}

export function isProjectorWriteHeartbeatActive() {
  return !!heartbeatActive(PROJECTOR_HB, { requireWrote: true });
}

export function assertComposerMayWrite(opts = {}) {
  if (isForceWriteEnabled())
    return { ok: true };

  {
    const raw = readMatcherHeartbeat();
    const hb = sanitizeMatcherHeartbeat(raw);
    if (isMatcherRunning(hb)) {
      const hbPid = Number(hb.pid) || 0;
      // viaMatcherWriter：本进程合场循环会写 matcher HB，只放行同 pid；
      // 仍须挡住「另一台 legacy/独立 matcher」与 composer 双写。
      if (opts.skipMatcherHeartbeat) {
        if (hbPid && hbPid !== process.pid) {
          return {
            ok: false,
            reason: `另一 matcher 进程 pid=${hbPid} 心跳仍活跃，拒绝与 composer 双写 client_matches。`
              + " 请先停旧 matcher，或设 MATCH_COMPOSER_FORCE_WRITE=1（危险）",
            heartbeat: hb,
          };
        }
      }
      else {
        return {
          ok: false,
          reason: "旧 matcher 心跳仍活跃，拒绝双写 client_matches。"
            + " 请先停 matcher，或设 MATCH_COMPOSER_FORCE_WRITE=1（危险）",
          heartbeat: hb,
        };
      }
    }
  }

  if (isProjectorWriteHeartbeatActive()) {
    return {
      ok: false,
      reason: "match-projector WRITE 心跳仍活跃，拒绝与 composer 双写。"
        + " 请先停 projector，或设 MATCH_COMPOSER_FORCE_WRITE=1（危险）",
    };
  }

  // 其它 composer WRITE 进程（viaMatcherWriter 也必须挡）
  if (process.env.MATCH_COMPOSER_ALLOW_MULTI !== "1") {
    const peer = heartbeatActive(COMPOSER_HEARTBEAT_PATH, { requireWrote: true });
    if (peer) {
      const peerPid = Number(peer.pid) || 0;
      if (peerPid && peerPid !== process.pid) {
        return {
          ok: false,
          reason: `另一 composer WRITE 进程 pid=${peerPid} 心跳仍活跃，拒绝双写`,
        };
      }
    }
  }

  return { ok: true };
}
