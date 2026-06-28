import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HEARTBEAT_PATH = path.join(__dirname, "..", ".matcher-heartbeat.json");
export const STALE_FACTOR = 2.5;

export function isPidAlive(pid) {
  if (!pid || pid <= 0)
    return false;
  if (process.platform === "win32") {
    try {
      const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], {
        encoding: "utf8",
        windowsHide: true,
      });
      return out.includes(String(pid));
    }
    catch {
      return false;
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  }
  catch (err) {
    return err.code === "EPERM";
  }
}

export function writeMatcherHeartbeat({ matchCount, intervalMs, builtAt, pid = process.pid, mode = "standalone" }) {
  const payload = {
    pid,
    mode,
    lastRun: Date.now(),
    intervalMs: intervalMs || 30_000,
    matchCount: matchCount ?? null,
    builtAt: builtAt ?? null,
  };
  fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(payload));
}

/** 心跳 pid 指向当前面板/backend 进程（多为误写的 rebuild 心跳），不能当作匹配脚本 */
export function isPanelProcessHeartbeat(hb, panelPid = process.pid) {
  if (hb?.mode === "embedded")
    return false;
  return !!(hb?.pid && Number(hb.pid) === Number(panelPid));
}

/**
 * 丢弃已退出进程或面板进程误写的心跳。
 * @returns {object|null} 仍有效的匹配脚本心跳
 */
export function sanitizeMatcherHeartbeat(hb, panelPid = process.pid) {
  if (!hb)
    return null;
  if (hb.pid && !isPidAlive(hb.pid)) {
    clearMatcherHeartbeat();
    return null;
  }
  if (isPanelProcessHeartbeat(hb, panelPid)) {
    clearMatcherHeartbeat();
    return null;
  }
  return hb;
}

export function readMatcherHeartbeat() {
  try {
    if (!fs.existsSync(HEARTBEAT_PATH))
      return null;
    return JSON.parse(fs.readFileSync(HEARTBEAT_PATH, "utf8"));
  }
  catch {
    return null;
  }
}

export function isMatcherRunning(hb, now = Date.now()) {
  if (!hb?.lastRun)
    return false;
  const ageMs = now - hb.lastRun;
  if (ageMs > (hb.intervalMs || 30_000) * STALE_FACTOR)
    return false;
  if (hb.pid && !isPidAlive(hb.pid))
    return false;
  return true;
}

export function clearMatcherHeartbeat() {
  try {
    if (fs.existsSync(HEARTBEAT_PATH))
      fs.unlinkSync(HEARTBEAT_PATH);
  }
  catch {
    /* best effort */
  }
}
