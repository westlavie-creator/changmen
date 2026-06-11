"use strict";

const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const { readMatcherHeartbeat, isMatcherRunning } = require("../lib/heartbeat");

const execFileAsync = promisify(execFile);
const MATCHER_ROOT = path.join(__dirname, "..");
const MATCHER_SCRIPT = path.join(MATCHER_ROOT, "matcher.js");

let managedChild = null;

function isManagedChildAlive() {
  if (!managedChild) return false;
  if (managedChild.exitCode != null || managedChild.signalCode) {
    managedChild = null;
    return false;
  }
  return true;
}

function attachChildHandlers(child) {
  child.stdout?.on("data", (buf) => process.stdout.write(`[matcher] ${buf}`));
  child.stderr?.on("data", (buf) => process.stderr.write(`[matcher] ${buf}`));
  child.on("exit", (code, signal) => {
    console.log(`[matcher] matcher exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (managedChild === child) managedChild = null;
  });
}

async function killPid(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  } else {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
    await new Promise((r) => setTimeout(r, 400));
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

async function startMatcherProcess() {
  if (isManagedChildAlive()) {
    return { ok: false, error: "匹配脚本已由本页面启动" };
  }
  const hb = readMatcherHeartbeat();
  if (isMatcherRunning(hb)) {
    return { ok: false, error: `匹配脚本已在运行（PID ${hb.pid}）` };
  }

  const child = spawn(process.execPath, [MATCHER_SCRIPT], {
    cwd: MATCHER_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  attachChildHandlers(child);
  managedChild = child;
  console.log(`[matcher] matcher started pid=${child.pid}`);
  return { ok: true, pid: child.pid };
}

async function stopMatcherProcess() {
  if (isManagedChildAlive()) {
    const pid = managedChild.pid;
    await killPid(pid);
    managedChild = null;
    console.log(`[matcher] matcher stopped pid=${pid}`);
    return { ok: true, pid, source: "managed" };
  }

  const hb = readMatcherHeartbeat();
  if (isMatcherRunning(hb) && hb.pid) {
    await killPid(hb.pid);
    console.log(`[matcher] matcher stopped pid=${hb.pid} (heartbeat)`);
    return { ok: true, pid: hb.pid, source: "heartbeat" };
  }

  return { ok: false, error: "未检测到本机可停止的匹配脚本" };
}

function isManagedByServer() {
  return isManagedChildAlive();
}

module.exports = {
  startMatcherProcess,
  stopMatcherProcess,
  isManagedByServer,
  isManagedChildAlive,
};
