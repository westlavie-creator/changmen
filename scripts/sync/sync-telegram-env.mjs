#!/usr/bin/env node
/**
 * Push TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID from local server/backend/.env to VPS.
 * Uses Node stdin (LF only) — PowerShell pipe to ssh adds CRLF and breaks bash -s.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadDeployConfig() {
  const cfg = {
    user: "root",
    host: "47.82.100.166",
    repo: "/root/changmen",
    sshIdentity: "",
  };
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const defaultKey = home
    ? path.join(home, ".ssh", "id_ed25519_gamebet")
    : "";
  if (defaultKey && fs.existsSync(defaultKey)) {
    cfg.sshIdentity = defaultKey;
  }
  const localBat = path.join(changmen, "BAT/deploy-server.local.bat");
  if (!fs.existsSync(localBat)) return cfg;
  for (const line of fs.readFileSync(localBat, "utf8").split(/\r?\n/)) {
    const u = line.match(/^\s*set\s+"DEPLOY_USER=(.+)"\s*$/i);
    const h = line.match(/^\s*set\s+"DEPLOY_HOST=(.+)"\s*$/i);
    const r = line.match(/^\s*set\s+"DEPLOY_REPO=(.+)"\s*$/i);
    const k = line.match(/^\s*set\s+"SSH_IDENTITY=(.+)"\s*$/i);
    if (u) cfg.user = u[1].trim();
    if (h) cfg.host = h[1].trim();
    if (r) cfg.repo = r[1].trim();
    if (k) cfg.sshIdentity = k[1].trim();
  }
  return cfg;
}

function readEnvValue(envPath, key) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}=(.+)$`));
    if (m) {
      const value = m[1].trim().replace(/^["']|["']$/g, "");
      if (!value) {
        console.error(`${key} empty in`, envPath);
        process.exit(1);
      }
      return value;
    }
  }
  console.error(`${key} not found in`, envPath);
  process.exit(1);
}

function readTelegramEnv() {
  const envPath = path.join(changmen, "server/backend/.env");
  if (!fs.existsSync(envPath)) {
    console.error("missing", envPath);
    process.exit(1);
  }
  return {
    token: readEnvValue(envPath, "TELEGRAM_BOT_TOKEN"),
    adminChatId: readEnvValue(envPath, "TELEGRAM_ADMIN_CHAT_ID"),
  };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const deploy = loadDeployConfig();
const { token, adminChatId } = readTelegramEnv();
const remoteSh = path.join(changmen, "deploy/scripts/sync-telegram-env-remote.sh");
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
  `export TELEGRAM_ADMIN_CHAT_ID=${shellSingleQuote(adminChatId)}`,
  "bash -s",
].join(" && ");

console.log(
  `Sync Telegram env to ${deploy.user}@${deploy.host}:${deploy.repo}/server/backend/.env`,
);

const result = spawnSync(
  "ssh",
  [
    ...(deploy.sshIdentity
      ? ["-i", deploy.sshIdentity, "-o", "IdentitiesOnly=yes"]
      : []),
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
