"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const HEARTBEAT_PATH = path.join(__dirname, "..", ".matcher-heartbeat.json");
const STALE_FACTOR = 2.5;

function isPidAlive(pid) {
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

function writeMatcherHeartbeat({ matchCount, intervalMs }) {
  const payload = {
    pid: process.pid,
    lastRun: Date.now(),
    intervalMs: intervalMs || 30_000,
    matchCount: matchCount ?? null,
  };
  fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(payload));
}

function readMatcherHeartbeat() {
  try {
    if (!fs.existsSync(HEARTBEAT_PATH)) return null;
    return JSON.parse(fs.readFileSync(HEARTBEAT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function isMatcherRunning(hb, now = Date.now()) {
  if (!hb?.lastRun) return false;
  const ageMs = now - hb.lastRun;
  if (ageMs > (hb.intervalMs || 30_000) * STALE_FACTOR) return false;
  if (hb.pid && !isPidAlive(hb.pid)) return false;
  return true;
}

function clearMatcherHeartbeat() {
  try {
    if (fs.existsSync(HEARTBEAT_PATH)) fs.unlinkSync(HEARTBEAT_PATH);
  } catch {
    /* best effort */
  }
}

module.exports = {
  HEARTBEAT_PATH,
  STALE_FACTOR,
  writeMatcherHeartbeat,
  readMatcherHeartbeat,
  isMatcherRunning,
  isPidAlive,
  clearMatcherHeartbeat,
};
