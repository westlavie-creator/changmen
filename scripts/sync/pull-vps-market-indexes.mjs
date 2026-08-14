#!/usr/bin/env node
/**
 * 本机开发：从生产 VPS 拉取 MarketIndex JSON → server/backend/storage/
 * （生产由 VPS collector 写同机文件；本机无 collector，需定期同步才有可订 asset）
 *
 * Usage:
 *   node scripts/sync/pull-vps-market-indexes.mjs
 *   node scripts/sync/pull-vps-market-indexes.mjs --watch
 *   node scripts/sync/pull-vps-market-indexes.mjs --interval 180
 *   node scripts/sync/pull-vps-market-indexes.mjs --only polymarket
 *
 * Env:
 *   DEPLOY_HOST / DEPLOY_USER / DEPLOY_REPO / SSH_IDENTITY
 *   （也可读 BAT/deploy-server.local.bat 或 sh/deploy-server.local.sh）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const INDEX_FILES = [
  { id: "polymarket", name: "polymarket_market_index.json" },
  { id: "predictfun", name: "predictfun_market_index.json" },
  { id: "sxbet", name: "sxbet_market_index.json" },
];

function loadDeployConfig() {
  const cfg = {
    user: process.env.DEPLOY_USER || "root",
    host: process.env.DEPLOY_HOST || "47.57.10.202",
    repo: process.env.DEPLOY_REPO || "/root/changmen",
    sshIdentity: process.env.SSH_IDENTITY || "",
  };
  const home = process.env.HOME || os.homedir() || "";
  const defaultKey = home ? path.join(home, ".ssh", "id_ed25519_changmen") : "";
  if (!cfg.sshIdentity && defaultKey && fs.existsSync(defaultKey))
    cfg.sshIdentity = defaultKey;

  const bat = path.join(changmen, "BAT/deploy-server.local.bat");
  if (fs.existsSync(bat)) {
    for (const line of fs.readFileSync(bat, "utf8").split(/\r?\n/)) {
      const u = line.match(/^\s*set\s+"DEPLOY_USER=(.+)"\s*$/i);
      const h = line.match(/^\s*set\s+"DEPLOY_HOST=(.+)"\s*$/i);
      const r = line.match(/^\s*set\s+"DEPLOY_REPO=(.+)"\s*$/i);
      const k = line.match(/^\s*set\s+"SSH_IDENTITY=(.+)"\s*$/i);
      if (u) cfg.user = u[1].trim();
      if (h) cfg.host = h[1].trim();
      if (r) cfg.repo = r[1].trim();
      if (k) cfg.sshIdentity = k[1].trim();
    }
  }

  const shLocal = path.join(changmen, "sh/deploy-server.local.sh");
  if (fs.existsSync(shLocal)) {
    for (const line of fs.readFileSync(shLocal, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(DEPLOY_USER|DEPLOY_HOST|DEPLOY_REPO|SSH_IDENTITY)="?([^"#]+)"?\s*$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^\$\{HOME\}/, home).replace(/^~/, home);
      if (key === "DEPLOY_USER") cfg.user = val;
      if (key === "DEPLOY_HOST") cfg.host = val;
      if (key === "DEPLOY_REPO") cfg.repo = val;
      if (key === "SSH_IDENTITY") cfg.sshIdentity = val;
    }
  }
  return cfg;
}

function parseArgs(argv) {
  let watch = false;
  let intervalSec = Number(process.env.MARKET_INDEX_SYNC_INTERVAL_SEC || 300);
  /** @type {Set<string>|null} */
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--watch" || a === "-w")
      watch = true;
    else if (a === "--interval" || a === "-i") {
      intervalSec = Number(argv[++i]);
    }
    else if (a.startsWith("--interval=")) {
      intervalSec = Number(a.slice("--interval=".length));
    }
    else if (a === "--only") {
      only = new Set(String(argv[++i] || "").split(",").map(s => s.trim()).filter(Boolean));
    }
    else if (a.startsWith("--only=")) {
      only = new Set(a.slice("--only=".length).split(",").map(s => s.trim()).filter(Boolean));
    }
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: pull-vps-market-indexes.mjs [--watch] [--interval 300] [--only polymarket,predictfun,sxbet]`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(intervalSec) || intervalSec < 30)
    intervalSec = 300;
  return { watch, intervalSec, only };
}

function sshArgs(cfg) {
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];
  if (cfg.sshIdentity && fs.existsSync(cfg.sshIdentity))
    args.push("-i", cfg.sshIdentity, "-o", "IdentitiesOnly=yes");
  args.push(`${cfg.user}@${cfg.host}`);
  return args;
}

function pullOne(cfg, localDir, fileName) {
  const remotePath = `${cfg.repo}/server/backend/storage/${fileName}`;
  // 经 ssh stdin 喂 python，避免 -c 多行引号被 shell 弄坏
  const remotePy = [
    "import json,sys",
    `p=${JSON.stringify(remotePath)}`,
    "try:",
    "  raw=open(p,'r',encoding='utf-8').read()",
    "  data=json.loads(raw)",
    "except FileNotFoundError:",
    "  sys.stderr.write('MISSING\\n'); sys.exit(2)",
    "except Exception as e:",
    "  sys.stderr.write(f'BADJSON {e}\\n'); sys.exit(3)",
    "if not isinstance(data, dict):",
    "  sys.stderr.write('NOTOBJ\\n'); sys.exit(3)",
    "sys.stdout.write(json.dumps(data, ensure_ascii=False, separators=(',',':')))",
  ].join("\n");

  const r = spawnSync(
    "ssh",
    [...sshArgs(cfg), "python3", "-"],
    { encoding: "utf8", input: remotePy, maxBuffer: 32 * 1024 * 1024 },
  );
  if (r.status === 2) {
    return { ok: false, skipped: true, reason: "remote missing" };
  }
  if (r.status !== 0) {
    return {
      ok: false,
      reason: (r.stderr || r.stdout || `ssh exit ${r.status}`).trim().slice(0, 240),
    };
  }
  let data;
  try {
    data = JSON.parse(r.stdout);
  }
  catch (err) {
    return { ok: false, reason: `local parse: ${err.message}` };
  }
  const entries = Array.isArray(data.entries) ? data.entries.length : null;
  const updatedAt = Number(data.updatedAt) || null;
  fs.mkdirSync(localDir, { recursive: true });
  const dest = path.join(localDir, fileName);
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, dest);
  return { ok: true, entries, updatedAt, bytes: fs.statSync(dest).size };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runOnce(cfg, only) {
  const localDir = process.env.CHANGMEN_STORAGE_DIR
    || process.env.GAMEBET_STORAGE_DIR
    || path.join(changmen, "server/backend/storage");
  const files = INDEX_FILES.filter(f => !only || only.has(f.id) || only.has(f.name));
  if (!files.length) {
    console.error("no index selected; --only ids:", INDEX_FILES.map(f => f.id).join(","));
    return false;
  }
  console.log(`[sync] ${cfg.user}@${cfg.host}:${cfg.repo}/server/backend/storage → ${localDir}`);
  let okAll = true;
  for (const f of files) {
    const r = pullOne(cfg, localDir, f.name);
    if (r.skipped) {
      console.log(`  - ${f.name}: skip (${r.reason})`);
      continue;
    }
    if (!r.ok) {
      okAll = false;
      console.error(`  - ${f.name}: FAIL ${r.reason}`);
      continue;
    }
    const iso = r.updatedAt ? new Date(r.updatedAt).toISOString() : "?";
    console.log(`  - ${f.name}: ok entries=${r.entries ?? "?"} updatedAt=${iso} bytes=${r.bytes}`);
  }
  return okAll;
}

const { watch, intervalSec, only } = parseArgs(process.argv.slice(2));
const cfg = loadDeployConfig();

if (!watch) {
  const ok = await runOnce(cfg, only);
  process.exit(ok ? 0 : 1);
}

console.log(`[sync] watch every ${intervalSec}s (Ctrl+C to stop)`);
for (;;) {
  const ok = await runOnce(cfg, only);
  if (!ok)
    console.warn("[sync] round had failures; will retry next interval");
  await sleep(intervalSec * 1000);
}
