#!/usr/bin/env node
/**
 * Push Predict.fun house 代下 env（API_KEY / PRIVY 私钥 / PREDICT_ACCOUNT）到 VPS。
 * 用法: node scripts/sync/sync-pf-house-env.mjs [host...]
 * 默认: 47.57.10.202
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hosts = process.argv.slice(2).filter(a => !a.startsWith("-"));
const HOSTS = hosts.length ? hosts : ["47.57.10.202"];

function readEnvValue(envPath, key, { optional = false, fallback = "" } = {}) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}=(.*)$`));
    if (!m)
      continue;
    const value = m[1].trim().replace(/^["']|["']$/g, "");
    if (!value) {
      if (optional)
        return fallback;
      console.error(`${key} empty in`, envPath);
      process.exit(1);
    }
    return value;
  }
  if (optional)
    return fallback;
  console.error(`${key} not found in`, envPath);
  process.exit(1);
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const envPath = path.join(changmen, "server/backend/.env");
if (!fs.existsSync(envPath)) {
  console.error("missing", envPath);
  process.exit(1);
}

const remoteSh = path.join(changmen, "deploy/scripts/sync-pf-house-env-remote.sh");
if (!fs.existsSync(remoteSh)) {
  console.error("missing", remoteSh);
  process.exit(1);
}

const apiBase = readEnvValue(envPath, "PREDICT_FUN_API_BASE", {
  optional: true,
  fallback: "https://api.predict.fun",
});
const apiKey = readEnvValue(envPath, "PREDICT_FUN_API_KEY");
const privyKey = readEnvValue(envPath, "PREDICT_FUN_PRIVY_PRIVATE_KEY");
const predictAccount = readEnvValue(envPath, "PREDICT_FUN_PREDICT_ACCOUNT");
const maxStake = readEnvValue(envPath, "PF_HOUSE_MAX_STAKE_USDT", {
  optional: true,
  fallback: "500",
});

const sshIdentity = path.join(os.homedir(), ".ssh", "id_ed25519_gamebet");
const scriptBody =
  fs
    .readFileSync(remoteSh, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trimEnd() + "\n";

for (const host of HOSTS) {
  console.log(`=== Sync PF house env -> ${host} ===`);
  const remoteCmd = [
    `export DEPLOY_REPO=${shellSingleQuote("/root/changmen")}`,
    `export PREDICT_FUN_API_BASE=${shellSingleQuote(apiBase)}`,
    `export PREDICT_FUN_API_KEY=${shellSingleQuote(apiKey)}`,
    `export PREDICT_FUN_PRIVY_PRIVATE_KEY=${shellSingleQuote(privyKey)}`,
    `export PREDICT_FUN_PREDICT_ACCOUNT=${shellSingleQuote(predictAccount)}`,
    `export PF_HOUSE_MAX_STAKE_USDT=${shellSingleQuote(maxStake)}`,
    "bash -s",
  ].join(" && ");

  const result = spawnSync(
    "ssh",
    [
      ...(fs.existsSync(sshIdentity)
        ? ["-i", sshIdentity, "-o", "IdentitiesOnly=yes"]
        : []),
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ConnectTimeout=60",
      "-o",
      "BatchMode=yes",
      `root@${host}`,
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
  if (result.status !== 0)
    process.exit(result.status ?? 1);
  console.log(`OK ${host}`);
}

console.log("=== Done ===");
