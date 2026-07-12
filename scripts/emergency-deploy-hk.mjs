#!/usr/bin/env node
/**
 * Emergency HK deploy using GHA-built dist artifact (skip local npm ci/build).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshKey = path.join(os.homedir(), ".ssh", "id_ed25519_gamebet");
const remote = "root@47.82.100.166";
const deployRepo = "/root/changmen";
const remoteScripts = "/tmp/changmen-deploy";
const repoArchive = path.join(os.tmpdir(), "changmen-repo.tgz");
const distArchive = path.join(os.tmpdir(), "changmen-gha-dist", "changmen-dist.tgz");

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function ssh(remoteCmd) {
  run("ssh", [
    "-i", sshKey, "-o", "IdentitiesOnly=yes",
    "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=8",
    "-o", "ConnectTimeout=60", "-o", "BatchMode=yes",
    remote, remoteCmd,
  ]);
}

function scp(local, remotePath) {
  run("scp", [
    "-i", sshKey, "-o", "IdentitiesOnly=yes",
    "-o", "ServerAliveInterval=30", "-o", "ConnectTimeout=60", "-o", "BatchMode=yes",
    local, `${remote}:${remotePath}`,
  ]);
}

if (!fs.existsSync(distArchive)) {
  console.error("missing dist artifact:", distArchive);
  process.exit(1);
}

console.log("[1/4] pack repo");
if (fs.existsSync(repoArchive)) fs.unlinkSync(repoArchive);
run("tar", [
  "-czf", repoArchive,
  "--exclude=node_modules",
  "--exclude=client/web/dist",
  "--exclude=client/web/node_modules",
  "--exclude=.git",
  ".",
], { cwd: changmen });

console.log("[2/4] upload");
scp(repoArchive, "/tmp/changmen-repo.upload.tgz");
ssh(`mkdir -p ${remoteScripts}`);
run("scp", [
  "-i", sshKey, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
  path.join(changmen, "deploy/scripts/apply-repo-archive.sh"),
  path.join(changmen, "deploy/scripts/deploy-server-remote.sh"),
  `${remote}:${remoteScripts}/`,
]);
ssh(`sed -i 's/\\r$//' ${remoteScripts}/apply-repo-archive.sh ${remoteScripts}/deploy-server-remote.sh`);

console.log("[3/4] apply archive");
ssh([
  "set -e",
  "mv /tmp/changmen-repo.upload.tgz /tmp/changmen-repo.tgz",
  "gzip -t /tmp/changmen-repo.tgz",
  `DEPLOY_REPO=${deployRepo} CHANGMEN_DEPLOY_SCRIPTS=${remoteScripts} DEPLOY_SKIP_APP_BUILD=1 DEPLOY_SKIP_POSTCHECK=1 DEPLOY_FULL=0 bash ${remoteScripts}/apply-repo-archive.sh /tmp/changmen-repo.tgz`,
].join("; "));

console.log("[4/4] replace dist + postcheck");
scp(distArchive, "/tmp/changmen-dist.tgz");
ssh(`set -euo pipefail
archive=/tmp/changmen-dist.tgz
app=${deployRepo}/client/web
tmp="$app/dist.upload.$$"
tar -tzf "$archive" >/dev/null
rm -rf "$tmp"
mkdir -p "$tmp"
tar -xzf "$archive" -C "$tmp"
test -f "$tmp/index.html"
test -d "$tmp/assets"
rm -rf "$app/dist.prev"
if [ -d "$app/dist" ]; then mv "$app/dist" "$app/dist.prev"; fi
mv "$tmp" "$app/dist"
rm -rf "$app/dist.prev" "$archive"
chmod -R a+rX "$app/dist"
echo dist_ok`);
ssh(`cd ${deployRepo}/server/backend && node scripts/post-deploy-check.mjs`);
ssh(`curl -sf -o /dev/null http://127.0.0.1:3456/ || curl -sf -o /dev/null http://127.0.0.1/; echo homepage_ok`);
console.log("DONE http://47.82.100.166/");
