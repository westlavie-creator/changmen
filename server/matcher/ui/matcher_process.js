import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  clearMatcherHeartbeat,
  isMatcherRunning,
  isPidAlive,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
} from "../lib/heartbeat.js";
import {
  getMatcherLoopState,
  startMatcherLoop,
  stopMatcherLoop,
} from "../loop.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHER_ROOT = path.join(__dirname, "..");
const MATCHER_SCRIPT = path.join(MATCHER_ROOT, "matcher.js");
const PM2_MATCHER_NAME = process.env.PM2_MATCHER_NAME || "changmen-matcher";

let managedChild = null;

export function isEmbeddedMatcherEnabled() {
  return String(process.env.MATCHER_EMBEDDED || "").trim() === "1";
}

function isManagedChildAlive() {
  if (!managedChild)
    return false;
  if (managedChild.exitCode != null || managedChild.signalCode) {
    managedChild = null;
    return false;
  }
  return true;
}

function tailText(text, maxChars = 400) {
  const s = String(text || "").trim();
  if (s.length <= maxChars)
    return s;
  return s.slice(-maxChars);
}

function attachChildHandlers(child, { onStderr } = {}) {
  child.stdout?.on("data", buf => process.stdout.write(`[matcher] ${buf}`));
  child.stderr?.on("data", (buf) => {
    const chunk = buf.toString();
    if (onStderr)
      onStderr(chunk);
    process.stderr.write(`[matcher] ${buf}`);
  });
  child.on("exit", (code, signal) => {
    console.log(`[matcher] matcher exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (managedChild === child)
      managedChild = null;
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
        if (hb?.pid === child.pid)
          clearMatcherHeartbeat();
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
            warning: "脚本已启动，首次 matchMerge 较慢，心跳稍后写入",
          });
        }
        else {
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
  if (!pid || pid <= 0)
    return true;
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    }
    catch {
      return !isPidAlive(pid);
    }
  }
  else {
    try { process.kill(pid, "SIGTERM"); }
    catch { /* already gone */ }
    await new Promise(r => setTimeout(r, 400));
    if (!isPidAlive(pid))
      return true;
    try { process.kill(pid, "SIGKILL"); }
    catch { /* already gone */ }
  }
  return !isPidAlive(pid);
}

async function readPm2MatcherOnlinePid() {
  try {
    const { stdout } = await execFileAsync("pm2", ["jlist"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 10_000,
    });
    const list = JSON.parse(stdout);
    const app = (list || []).find(row => row?.name === PM2_MATCHER_NAME);
    if (app?.pm2_env?.status !== "online")
      return null;
    const pid = Number(app.pid);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  }
  catch {
    return null;
  }
}

async function stopPm2Matcher() {
  try {
    await execFileAsync("pm2", ["stop", PM2_MATCHER_NAME], { timeout: 20_000 });
    clearMatcherHeartbeat();
    const still = await readPm2MatcherOnlinePid();
    if (still) {
      return { ok: false, error: `PM2 停止 ${PM2_MATCHER_NAME} 失败（仍在运行 PID ${still}）` };
    }
    return { ok: true, source: "pm2" };
  }
  catch (err) {
    return { ok: false, error: `PM2 停止失败：${err.message}` };
  }
}

export async function startMatcherProcess() {
  if (isEmbeddedMatcherEnabled()) {
    const state = getMatcherLoopState();
    if (state.running) {
      return {
        ok: true,
        pid: state.pid,
        source: "embedded",
        embedded: true,
        warning: "匹配循环已由 web 进程内嵌运行",
      };
    }
    return { ...(await startMatcherLoop({ mode: "embedded" })), source: "embedded", embedded: true };
  }
  if (isManagedChildAlive()) {
    return { ok: false, error: "匹配脚本已由本页面启动" };
  }
  const pm2Pid = await readPm2MatcherOnlinePid();
  if (pm2Pid) {
    return {
      ok: false,
      error: `匹配脚本已在运行（PM2 ${PM2_MATCHER_NAME}，PID ${pm2Pid}）`,
    };
  }
  const hb = sanitizeMatcherHeartbeat(readMatcherHeartbeat());
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
    if (!childExited(child))
      await killPid(child.pid);
    const detail = tailText(stderrTail);
    return {
      ok: false,
      error: detail ? `${result.error}：${detail}` : result.error,
    };
  }
  return result;
}

export async function stopMatcherProcess() {
  const embeddedState = getMatcherLoopState();
  if (embeddedState.running) {
    const result = stopMatcherLoop();
    clearMatcherHeartbeat();
    console.log(`[matcher] embedded matcher stopped pid=${embeddedState.pid}`);
    return { ...result, source: "embedded", embedded: true };
  }

  if (isManagedChildAlive()) {
    const pid = managedChild.pid;
    const killed = await killPid(pid);
    managedChild = null;
    clearMatcherHeartbeat();
    if (!killed) {
      return { ok: false, error: `无法终止匹配脚本（PID ${pid}）` };
    }
    console.log(`[matcher] matcher stopped pid=${pid}`);
    return { ok: true, pid, source: "managed" };
  }

  const pm2Pid = await readPm2MatcherOnlinePid();
  if (pm2Pid) {
    const pm2Result = await stopPm2Matcher();
    if (pm2Result.ok) {
      console.log(`[matcher] matcher stopped via pm2 (${PM2_MATCHER_NAME}, was pid=${pm2Pid})`);
      return { ok: true, pid: pm2Pid, source: "pm2" };
    }
    return pm2Result;
  }

  const hb = sanitizeMatcherHeartbeat(readMatcherHeartbeat());
  if (hb?.pid && (isMatcherRunning(hb) || isPidAlive(hb.pid))) {
    const pid = hb.pid;
    const killed = await killPid(pid);
    clearMatcherHeartbeat();
    if (!killed) {
      return {
        ok: false,
        error: `无法终止匹配脚本（PID ${pid}）。若在 VPS 使用 PM2，请执行：pm2 stop ${PM2_MATCHER_NAME}`,
      };
    }
    console.log(`[matcher] matcher stopped pid=${pid} (heartbeat)`);
    return { ok: true, pid, source: "heartbeat" };
  }

  return {
    ok: false,
    error: `未检测到本机可停止的匹配脚本（PM2 名：${PM2_MATCHER_NAME}）`,
  };
}

export function isManagedByServer() {
  return isManagedChildAlive() || getMatcherLoopState().running;
}

export function getManagedMatcherPid() {
  const embeddedState = getMatcherLoopState();
  if (embeddedState.running)
    return embeddedState.pid;
  return isManagedChildAlive() ? managedChild.pid : null;
}

export function getEmbeddedMatcherState() {
  return getMatcherLoopState();
}

export async function getPm2MatcherOnlinePid() {
  return readPm2MatcherOnlinePid();
}
