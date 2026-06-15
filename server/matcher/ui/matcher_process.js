import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  readMatcherHeartbeat,
  isMatcherRunning,
  isPidAlive,
  clearMatcherHeartbeat,
} from "../lib/heartbeat.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

function tailText(text, maxChars = 400) {
  const s = String(text || "").trim();
  if (s.length <= maxChars) return s;
  return s.slice(-maxChars);
}

function attachChildHandlers(child, { onStderr } = {}) {
  child.stdout?.on("data", (buf) => process.stdout.write(`[matcher] ${buf}`));
  child.stderr?.on("data", (buf) => {
    const chunk = buf.toString();
    if (onStderr) onStderr(chunk);
    process.stderr.write(`[matcher] ${buf}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[matcher] matcher exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (managedChild === child) managedChild = null;
  });
}

const START_WAIT_MS = 60_000;
const START_POLL_MS = 400;

function childExited(child) {
  return child.exitCode != null || child.signalCode;
}

function waitForMatcherReady(child) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (childExited(child)) {
        const hb = readMatcherHeartbeat();
        if (hb?.pid === child.pid) clearMatcherHeartbeat();
        resolve({
          ok: false,
          error: `匹配脚本已退出（code=${child.exitCode ?? "?"}）`,
        });
        return;
      }
      const hb = readMatcherHeartbeat();
      if (hb?.pid === child.pid && isMatcherRunning(hb)) {
        resolve({ ok: true, pid: child.pid });
        return;
      }
      if (Date.now() - startedAt >= START_WAIT_MS) {
        if (isManagedChildAlive()) {
          resolve({
            ok: true,
            pid: child.pid,
            warning: "脚本已启动，首次 rebuild 较慢，心跳稍后写入",
          });
        } else {
          resolve({ ok: false, error: "匹配脚本启动超时" });
        }
        return;
      }
      setTimeout(tick, START_POLL_MS);
    };
    tick();
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

export async function startMatcherProcess() {
  if (isManagedChildAlive()) {
    return { ok: false, error: "匹配脚本已由本页面启动" };
  }
  const hb = readMatcherHeartbeat();
  if (isMatcherRunning(hb)) {
    return { ok: false, error: `匹配脚本已在运行（PID ${hb.pid}）` };
  }

  let stderrTail = "";
  const child = spawn(process.execPath, [MATCHER_SCRIPT], {
    cwd: MATCHER_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  attachChildHandlers(child, {
    onStderr: (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    },
  });
  managedChild = child;
  console.log(`[matcher] matcher started pid=${child.pid}`);

  const result = await waitForMatcherReady(child);
  if (!result.ok) {
    managedChild = null;
    if (!childExited(child)) await killPid(child.pid);
    const detail = tailText(stderrTail);
    return {
      ok: false,
      error: detail ? `${result.error}：${detail}` : result.error,
    };
  }
  return result;
}

export async function stopMatcherProcess() {
  if (isManagedChildAlive()) {
    const pid = managedChild.pid;
    await killPid(pid);
    managedChild = null;
    clearMatcherHeartbeat();
    console.log(`[matcher] matcher stopped pid=${pid}`);
    return { ok: true, pid, source: "managed" };
  }

  const hb = readMatcherHeartbeat();
  if (hb?.pid && (isMatcherRunning(hb) || isPidAlive(hb.pid))) {
    const pid = hb.pid;
    await killPid(pid);
    clearMatcherHeartbeat();
    if (isPidAlive(pid)) {
      return { ok: false, error: `无法终止匹配脚本（PID ${pid}）` };
    }
    console.log(`[matcher] matcher stopped pid=${pid} (heartbeat)`);
    return { ok: true, pid, source: "heartbeat" };
  }

  return { ok: false, error: "未检测到本机可停止的匹配脚本" };
}

export function isManagedByServer() {
  return isManagedChildAlive();
}

export function getManagedMatcherPid() {
  return isManagedChildAlive() ? managedChild.pid : null;
}
