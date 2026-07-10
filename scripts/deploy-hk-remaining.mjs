#!/usr/bin/env node
/**
 * Deploy repo + existing GHA dist to remaining HK hosts (skip local build).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const changmen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshKey = path.join(os.homedir(), ".ssh", "id_ed25519_gamebet");
const deployRepo = "/root/changmen";
const remoteScripts = "/tmp/changmen-deploy";
const repoArchive = path.join(os.tmpdir(), `changmen-repo-${process.pid}.tgz`);
const distArchive = path.join(os.tmpdir(), "changmen-gha-dist", "changmen-dist.tgz");

const HOSTS = process.argv.slice(2).length
  ? process.argv.slice(2).map(host => ({ label: host, host }))
  : [
      { label: "HK-214", host: "47.242.248.214" },
      { label: "HK-57", host: "47.57.10.202" },
    ];

const sshBase = [
  "-i", sshKey,
  "-o", "IdentitiesOnly=yes",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=8",
  "-o", "ConnectTimeout=60",
  "-o", "BatchMode=yes",
];

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

function ssh(host, remoteCmd) {
  run("ssh", [...sshBase, `root@${host}`, remoteCmd]);
}

function scp(host, local, remotePath) {
  run("scp", [...sshBase, local, `root@${host}:${remotePath}`]);
}

if (!fs.existsSync(distArchive)) {
  console.error("missing dist:", distArchive);
  process.exit(1);
}

console.log("=== Pack repo ===");
try {
  if (fs.existsSync(repoArchive)) fs.unlinkSync(repoArchive);
}
catch {
  /* ignore locked temp from previous run */
}
run("tar", [
  "-czf", repoArchive,
  "--exclude=node_modules",
  "--exclude=client/web/dist",
  "--exclude=client/web/node_modules",
  "--exclude=.git",
  ".",
], { cwd: changmen });

const applyScript = path.join(changmen, "deploy/scripts/apply-repo-archive.sh");
const deployRemote = path.join(changmen, "deploy/scripts/deploy-server-remote.sh");

const results = [];
for (const h of HOSTS) {
  console.log(`\n========== Deploy ${h.label} (${h.host}) ==========`);
  try {
    scp(h.host, repoArchive, "/tmp/changmen-repo.upload.tgz");
    ssh(h.host, `mkdir -p ${remoteScripts}`);
    run("scp", [...sshBase, applyScript, deployRemote, `root@${h.host}:${remoteScripts}/`]);
    ssh(h.host, `sed -i 's/\\r$//' ${remoteScripts}/apply-repo-archive.sh ${remoteScripts}/deploy-server-remote.sh`);
    ssh(h.host, [
      "set -e",
      "mv /tmp/changmen-repo.upload.tgz /tmp/changmen-repo.tgz",
      "gzip -t /tmp/changmen-repo.tgz",
      `DEPLOY_REPO=${deployRepo} CHANGMEN_DEPLOY_SCRIPTS=${remoteScripts} DEPLOY_SKIP_APP_BUILD=1 DEPLOY_SKIP_POSTCHECK=1 DEPLOY_FULL=0 bash ${remoteScripts}/apply-repo-archive.sh /tmp/changmen-repo.tgz`,
    ].join("; "));

    scp(h.host, distArchive, "/tmp/changmen-dist.tgz");
    ssh(h.host, `set -euo pipefail
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
chmod -R a+rX "$app/dist"`);

    ssh(h.host, `cd ${deployRepo}/server/backend; node scripts/post-deploy-check.mjs --skip-telegram`);
    ssh(h.host, `curl -sf -o /dev/null http://127.0.0.1:3456/ || curl -sf -o /dev/null http://127.0.0.1/`);
    ssh(h.host, `grep -n venueAccountName ${deployRepo}/client/web/src/components/account/AccountCard.vue | head -1`);
    console.log(`OK ${h.label} http://${h.host}/`);
    results.push({ ...h, ok: true });
  }
  catch (err) {
    console.error(`FAIL ${h.label}:`, err.message || err);
    results.push({ ...h, ok: false, error: String(err.message || err) });
  }
}

console.log("\n=== Summary ===");
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.label} ${r.host}${r.error ? ` — ${r.error}` : ""}`);
}
if (results.some(r => !r.ok)) process.exit(1);
