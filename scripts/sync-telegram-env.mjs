#!/usr/bin/env node
/**
 * Push TELEGRAM_BOT_TOKEN from local apps/backend/.env to VPS and restart gamebet-web.
 * Uses Node stdin (LF only) — PowerShell pipe to ssh adds CRLF and breaks bash -s.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDeployConfig() {
  const cfg = {
    user: "root",
    host: "47.82.100.166",
    repo: "/root/gamebet",
  };
  const localBat = path.join(changmen, "BAT/deploy-server.local.bat");
  if (!fs.existsSync(localBat)) return cfg;
  for (const line of fs.readFileSync(localBat, "utf8").split(/\r?\n/)) {
    const u = line.match(/^\s*set\s+"DEPLOY_USER=(.+)"\s*$/i);
    const h = line.match(/^\s*set\s+"DEPLOY_HOST=(.+)"\s*$/i);
    const r = line.match(/^\s*set\s+"DEPLOY_REPO=(.+)"\s*$/i);
    if (u) cfg.user = u[1].trim();
    if (h) cfg.host = h[1].trim();
    if (r) cfg.repo = r[1].trim();
  }
  return cfg;
}

function readTelegramToken() {
  const envPath = path.join(changmen, "apps/backend/.env");
  if (!fs.existsSync(envPath)) {
    console.error("missing", envPath);
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*TELEGRAM_BOT_TOKEN=(.+)$/);
    if (m) {
      const token = m[1].trim().replace(/^["']|["']$/g, "");
      if (!token) {
        console.error("TELEGRAM_BOT_TOKEN empty in", envPath);
        process.exit(1);
      }
      return token;
    }
  }
  console.error("TELEGRAM_BOT_TOKEN not found in", envPath);
  process.exit(1);
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const deploy = loadDeployConfig();
const token = readTelegramToken();
const remoteSh = path.join(changmen, "scripts/sync-telegram-env-remote.sh");
if (!fs.existsSync(remoteSh)) {
  console.error("missing", remoteSh);
  process.exit(1);
}

const scriptBody =
  fs
    .readFileSync(remoteSh, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trimEnd() + "\n";

const remoteCmd = [
  `export DEPLOY_REPO=${shellSingleQuote(deploy.repo)}`,
  `export TELEGRAM_BOT_TOKEN=${shellSingleQuote(token)}`,
  "bash -s",
].join(" && ");

console.log(
  `Sync TELEGRAM_BOT_TOKEN to ${deploy.user}@${deploy.host}:${deploy.repo}/changmen/apps/backend/.env`,
);

const result = spawnSync(
  "ssh",
  [
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ConnectTimeout=60",
    `${deploy.user}@${deploy.host}`,
    remoteCmd,
  ],
  {
    input: scriptBody,
    stdio: ["pipe", "inherit", "inherit"],
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === 0 ? 0 : result.status ?? 1);
