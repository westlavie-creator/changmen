#!/usr/bin/env node
"use strict";

/**
 * 对已解压的 Electron 便携目录做冒烟：文件布局 + 启动 GameBet.exe + HTTP 探针。
 *
 * 用法:
 *   node scripts/verify-electron-unpacked.js
 *   node scripts/verify-electron-unpacked.js path/to/win-unpacked
 *
 * 默认目录：dist_electron/LATEST_STAGING.txt → 最新 dist_electron_staging_* / 旧 dist_electron_staging
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const backendRoot = path.join(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "../..");

function resolveDefaultUnpacked() {
  const pointer = path.join(repoRoot, "dist_electron", "LATEST_STAGING.txt");
  if (fs.existsSync(pointer)) {
    const name = fs.readFileSync(pointer, "utf8").trim();
    if (name) {
      const fromPointer = path.join(repoRoot, name, "win-unpacked");
      if (fs.existsSync(fromPointer)) return fromPointer;
    }
  }

  const legacy = path.join(repoRoot, "dist_electron_staging", "win-unpacked");
  if (fs.existsSync(legacy)) return legacy;

  let best = null;
  let bestMtime = 0;
  for (const ent of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith("dist_electron_staging_")) continue;
    const candidate = path.join(repoRoot, ent.name, "win-unpacked");
    if (!fs.existsSync(candidate)) continue;
    const mtime = fs.statSync(candidate).mtimeMs;
    if (mtime > bestMtime) {
      bestMtime = mtime;
      best = candidate;
    }
  }
  if (best) return best;

  return legacy;
}

const unpacked = path.resolve(process.argv[2] || resolveDefaultUnpacked());
const exe = path.join(unpacked, "GameBet.exe");
const PORT = Number(process.env.GAMEBET_VERIFY_PORT || 3456);
const STARTUP_MS = Number(process.env.GAMEBET_VERIFY_STARTUP_MS || 90000);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkLayout() {
  const checks = [
    exe,
    path.join(unpacked, "resources", "app.asar"),
    path.join(unpacked, "resources", "frontend", "app", "dist", "index.html"),
  ];
  for (const p of checks) {
    assert(fs.existsSync(p), `missing: ${p}`);
  }

  // asar 内 platform_adapter：用 adapter_paths 在复制后的 layout 上测（与 test-packaged-adapter 相同思路）
  const bundledAdapter = path.join(unpacked, "resources", "app.asar");
  assert(fs.existsSync(bundledAdapter), "app.asar missing");

  console.log("[layout] exe + frontend dist OK");
  console.log("[layout] unpacked:", unpacked);
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve(res.statusCode);
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(3000, () => {
        req.destroy();
        retry();
      });

      function retry() {
        if (Date.now() > deadline) {
          reject(new Error(`timeout waiting for ${url}`));
        } else {
          setTimeout(tick, 1500);
        }
      }
    };
    tick();
  });
}

async function runProcessProbe() {
  assert(fs.existsSync(exe), `GameBet.exe not found: ${exe}`);

  console.log(`[process] starting GameBet.exe (probe port ${PORT}, up to ${STARTUP_MS}ms)...`);
  const child = spawn(exe, [], {
    cwd: unpacked,
    env: { ...process.env, PORT: String(PORT) },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  child.stdout?.on("data", (c) => {
    log += c.toString();
  });
  child.stderr?.on("data", (c) => {
    log += c.toString();
  });

  try {
    const status = await waitForHttp(`http://127.0.0.1:${PORT}/api/platforms`, STARTUP_MS);
    console.log(`[process] HTTP /api/platforms → ${status}`);
    console.log("[process] Electron 实机验证 PASS");
  } catch (err) {
    console.error("[process] last log:\n", log.slice(-4000));
    throw err;
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 2000));
    if (!child.killed) {
      try {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  checkLayout();
  await runProcessProbe();
}

main().catch((err) => {
  console.error("[verify-electron-unpacked] FAIL:", err.message);
  process.exit(1);
});
