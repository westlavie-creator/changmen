"use strict";

const fs = require("fs");
const path = require("path");

const HEARTBEAT_PATH = path.join(__dirname, "..", ".matcher-heartbeat.json");
const STALE_FACTOR = 2.5;

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
  return ageMs <= (hb.intervalMs || 30_000) * STALE_FACTOR;
}

module.exports = {
  HEARTBEAT_PATH,
  STALE_FACTOR,
  writeMatcherHeartbeat,
  readMatcherHeartbeat,
  isMatcherRunning,
};
