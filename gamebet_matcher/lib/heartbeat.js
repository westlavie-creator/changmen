import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HEARTBEAT_PATH = path.join(__dirname, "..", ".matcher-heartbeat.json");
export const STALE_FACTOR = 2.5;

export function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  if (process.platform === "win32") {
    try {
      const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], {
        encoding: "utf8",
        windowsHide: true,
      });
      return out.includes(String(pid));
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

export function writeMatcherHeartbeat({ matchCount, intervalMs, builtAt }) {
  const payload = {
    pid: process.pid,
    lastRun: Date.now(),
    intervalMs: intervalMs || 30_000,
    matchCount: matchCount ?? null,
    builtAt: builtAt ?? null,
  };
  fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(payload));
}

export function readMatcherHeartbeat() {
  try {
    if (!fs.existsSync(HEARTBEAT_PATH)) return null;
    return JSON.parse(fs.readFileSync(HEARTBEAT_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function isMatcherRunning(hb, now = Date.now()) {
  if (!hb?.lastRun) return false;
  const ageMs = now - hb.lastRun;
  if (ageMs > (hb.intervalMs || 30_000) * STALE_FACTOR) return false;
  if (hb.pid && !isPidAlive(hb.pid)) return false;
  return true;
}

export function clearMatcherHeartbeat() {
  try {
    if (fs.existsSync(HEARTBEAT_PATH)) fs.unlinkSync(HEARTBEAT_PATH);
  } catch {
    /* best effort */
  }
}
