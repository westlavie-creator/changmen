import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPidAlive } from "../../matcher/lib/heartbeat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const COMPOSER_HEARTBEAT_PATH = path.join(__dirname, "..", ".composer-heartbeat.json");

export function writeComposerHeartbeat({
  matchCount,
  intervalMs,
  builtAt,
  pid = process.pid,
  wrote = false,
}) {
  fs.writeFileSync(COMPOSER_HEARTBEAT_PATH, JSON.stringify({
    pid,
    mode: "composer",
    lastRun: Date.now(),
    intervalMs: intervalMs || 30_000,
    matchCount: matchCount ?? null,
    builtAt: builtAt ?? null,
    wrote: !!wrote,
  }));
}

export function readComposerHeartbeat() {
  try {
    if (!fs.existsSync(COMPOSER_HEARTBEAT_PATH))
      return null;
    return JSON.parse(fs.readFileSync(COMPOSER_HEARTBEAT_PATH, "utf8"));
  }
  catch {
    return null;
  }
}

export function clearComposerHeartbeat() {
  try {
    if (fs.existsSync(COMPOSER_HEARTBEAT_PATH))
      fs.unlinkSync(COMPOSER_HEARTBEAT_PATH);
  }
  catch { /* best effort */ }
}

/**
 * 丢弃已退出进程留下的 WRITE 心跳，避免重启后被 90s 窗口误挡。
 * @returns {object|null} 仍有效的心跳
 */
export function sanitizeComposerHeartbeat(hb = readComposerHeartbeat()) {
  if (!hb)
    return null;
  const pid = Number(hb.pid) || 0;
  if (pid && !isPidAlive(pid)) {
    clearComposerHeartbeat();
    return null;
  }
  return hb;
}
