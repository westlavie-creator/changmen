#!/usr/bin/env node
/**
 * Deploy repo + local dist to HK hosts.
 * Default: pack dist from client/web/dist (must exist — run with --build to build first).
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
const distDir = path.join(changmen, "client/web/dist");
const distArchive = path.join(os.tmpdir(), "changmen-gha-dist", "changmen-dist.tgz");

const args = new Set(process.argv.slice(2));
const hostArgs = process.argv.slice(2).filter(a => !a.startsWith("-"));
const HOSTS = hostArgs.length
  ? hostArgs.map(host => ({ label: host, host }))
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

const deployScripts = [
  "apply-repo-archive.sh",
  "deploy-server-remote.sh",
  "sync-hk-relay-env-remote.sh",
  "sync-pm-hk-relay-env-remote.sh",
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

function packLocalDist() {
  const indexHtml = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtml))
    throw new Error(`missing ${indexHtml} — run: npm run app:build  (or pass --build)`);
  fs.mkdirSync(path.dirname(distArchive), { recursive: true });
  if (fs.existsSync(distArchive))
    fs.unlinkSync(distArchive);
  run("tar", ["-czf", distArchive, "-C", distDir, "."]);
  console.log(`==> packed dist -> ${distArchive}`);
}

if (args.has("--build")) {
  console.log("=== Build frontend ===");
  run("npm", ["run", "app:build"], { cwd: changmen });
}

console.log("=== Pack dist ===");
packLocalDist();

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

const scriptPaths = deployScripts.map(name => path.join(changmen, "deploy/scripts", name));

const results = [];
for (const h of HOSTS) {
  console.log(`\n========== Deploy ${h.label} (${h.host}) ==========`);
  try {
    scp(h.host, repoArchive, "/tmp/changmen-repo.upload.tgz");
    ssh(h.host, `mkdir -p ${remoteScripts}`);
    run("scp", [...sshBase, ...scriptPaths, `root@${h.host}:${remoteScripts}/`]);
    ssh(h.host, `sed -i 's/\\r$//' ${remoteScripts}/*.sh`);
    ssh(h.host, [
      "set -e",
      "mv /tmp/changmen-repo.upload.tgz /tmp/changmen-repo.tgz",
      "gzip -t /tmp/changmen-repo.tgz",
      `DEPLOY_REPO=${deployRepo} CHANGMEN_DEPLOY_SCRIPTS=${remoteScripts} DEPLOY_SKIP_APP_BUILD=1 DEPLOY_SKIP_POSTCHECK=1 DEPLOY_FULL=0 bash ${remoteScripts}/apply-repo-archive.sh /tmp/changmen-repo.tgz`,
      `find ${deployRepo}/deploy/scripts -name '*.sh' -exec sed -i 's/\\r$//' {} +`,
    ].join("; "));

    scp(h.host, distArchive, "/tmp/changmen-dist.tgz");
    const appWeb = `${deployRepo}/client/web`;
    ssh(h.host, [
      "set -euo pipefail",
      "archive=/tmp/changmen-dist.tgz",
      `tmp=${appWeb}/dist.upload`,
      'tar -tzf "$archive" >/dev/null',
      'rm -rf "$tmp"',
      'mkdir -p "$tmp"',
      'tar -xzf "$archive" -C "$tmp"',
      'test -f "$tmp/index.html"',
      'test -d "$tmp/assets"',
      `rm -rf ${appWeb}/dist.prev`,
      `[ -d ${appWeb}/dist ] && mv ${appWeb}/dist ${appWeb}/dist.prev || true`,
      `mv "$tmp" ${appWeb}/dist`,
      `rm -rf ${appWeb}/dist.prev "$archive"`,
      `chmod -R a+rX ${appWeb}/dist`,
      `grep -o 'venue-shared-[^"]*' ${appWeb}/dist/index.html | head -1`,
    ].join("; "));

    ssh(h.host, `cd ${deployRepo}/server/backend; node scripts/post-deploy-check.mjs --skip-telegram`);

    console.log("==> sync HK relay env (whitelist + pm2 restart)");
    const predictKey = process.env.PREDICT_FUN_API_KEY || "";
    ssh(h.host, `set -e
for i in 1 2 3 4 5; do
  if [ -f ${deployRepo}/server/backend/.env ]; then break; fi
  sleep 1
done
test -f ${deployRepo}/server/backend/.env
cd ${deployRepo} && PREDICT_FUN_API_KEY='${predictKey.replace(/'/g, "'\\''")}' bash deploy/scripts/sync-hk-relay-env-remote.sh`);

    ssh(h.host, `set -e
status="$(curl -sf http://127.0.0.1/api/proxy/status 2>/dev/null || curl -sf http://127.0.0.1:3456/api/proxy/status)"
echo "$status"
echo "$status" | grep -q '"PREDICTFUN-MARKET"'`);
    ssh(h.host, `curl -sf -o /dev/null http://127.0.0.1/ || curl -sf -o /dev/null http://127.0.0.1:3456/`);
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
