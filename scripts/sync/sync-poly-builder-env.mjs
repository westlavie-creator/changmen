#!/usr/bin/env node
/**
 * Push POLY_BUILDER_* (+ CODE) from local server/backend/.env to HK + SH VPS.
 * Uses Node stdin (LF only) — PowerShell pipe to ssh adds CRLF and breaks bash -s.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CODE = "0x58ec38dac8719b354dfd2a47d6ac27ab01babea9102a993c1abe4af30ec2883f";

const HOSTS = [
  { label: "HongKong", host: "47.82.100.166" },
  { label: "Shanghai", host: "106.14.82.50" },
];

function readEnvValue(envPath, key, { optional = false } = {}) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}=(.+)$`));
    if (m) {
      const value = m[1].trim().replace(/^["']|["']$/g, "");
      if (!value) {
        if (optional) return "";
        console.error(`${key} empty in`, envPath);
        process.exit(1);
      }
      return value;
    }
  }
  if (optional) return "";
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

const remoteSh = path.join(changmen, "deploy/scripts/sync-poly-builder-env-remote.sh");
if (!fs.existsSync(remoteSh)) {
  console.error("missing", remoteSh);
  process.exit(1);
}

const apiKey = readEnvValue(envPath, "POLY_BUILDER_API_KEY");
const secret = readEnvValue(envPath, "POLY_BUILDER_SECRET");
const passphrase = readEnvValue(envPath, "POLY_BUILDER_PASSPHRASE");
const code = readEnvValue(envPath, "POLY_BUILDER_CODE", { optional: true }) || DEFAULT_CODE;

const sshIdentity = path.join(os.homedir(), ".ssh", "id_ed25519_gamebet");
const scriptBody =
  fs
    .readFileSync(remoteSh, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trimEnd() + "\n";

for (const h of HOSTS) {
  console.log(`=== Sync ${h.label} (${h.host}) ===`);
  const remoteCmd = [
    `export DEPLOY_REPO=${shellSingleQuote("/root/changmen")}`,
    `export POLY_BUILDER_API_KEY=${shellSingleQuote(apiKey)}`,
    `export POLY_BUILDER_SECRET=${shellSingleQuote(secret)}`,
    `export POLY_BUILDER_PASSPHRASE=${shellSingleQuote(passphrase)}`,
    `export POLY_BUILDER_CODE=${shellSingleQuote(code)}`,
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
      `root@${h.host}`,
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
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("=== Done ===");
