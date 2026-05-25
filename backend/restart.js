#!/usr/bin/env node
"use strict";

const { spawn, execSync } = require("child_process");
const path = require("path");

const PORT = Number(process.env.PORT || 3456);
const SERVER = path.join(__dirname, "server.js");
const background = process.argv.includes("--background") || process.argv.includes("-b");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killPort(port) {
  const killed = new Set();
  if (process.platform === "win32") {
    try {
      const out = execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      );
      for (const pid of out.trim().split(/\s+/).filter(Boolean)) {
        const n = Number(pid);
        if (!n || killed.has(n)) continue;
        try {
          execSync(`taskkill /PID ${n} /F`, { stdio: "ignore" });
          killed.add(n);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* no listener on port */
    }
    return [...killed];
  }

  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const pid of out.trim().split(/\s+/).filter(Boolean)) {
      const n = Number(pid);
      if (!n || killed.has(n)) continue;
      try {
        process.kill(n, "SIGTERM");
        killed.add(n);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no listener on port */
  }
  return [...killed];
}

function startServer() {
  const child = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    env: process.env,
    stdio: background ? "ignore" : "inherit",
    detached: background,
  });
  if (background) {
    child.unref();
    console.log(`Dashboard started in background (pid ${child.pid})`);
    console.log(`http://localhost:${PORT}`);
    return;
  }
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

async function main() {
  const pids = killPort(PORT);
  if (pids.length) {
    console.log(`Stopped process on port ${PORT}: ${pids.join(", ")}`);
    await sleep(1000);
  } else {
    console.log(`No process listening on port ${PORT}`);
  }
  startServer();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
