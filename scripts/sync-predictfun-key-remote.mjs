#!/usr/bin/env node
/** Sync PREDICT_FUN_API_KEY from local env files to VPS via temp file (no key in argv). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hosts = process.argv.slice(2);
if (!hosts.length) {
  console.error("usage: node scripts/sync-predictfun-key-remote.mjs <host> [...]");
  process.exit(1);
}

function readPredictKey() {
  const candidates = [
    path.join(root, "server/backend/.env"),
    path.join(root, "client/web/.env.production"),
    path.join(root, "client/web/.env.local"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file))
      continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^(?:VITE_)?PREDICT_FUN_API_KEY=(.+)$/);
      const val = m?.[1]?.trim();
      if (val)
        return val;
    }
  }
  throw new Error("PREDICT_FUN_API_KEY not found in local env files");
}

const key = readPredictKey();
const sshKey = path.join(os.homedir(), ".ssh", "id_ed25519_gamebet");
const sshBase = [
  "-i", sshKey,
  "-o", "IdentitiesOnly=yes",
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=60",
  "-o", "ServerAliveInterval=30",
];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0)
    process.exit(r.status ?? 1);
}

for (const host of hosts) {
  console.log(`\n== sync PREDICT_FUN_API_KEY -> ${host} ==`);
  const tmp = path.join(os.tmpdir(), `pf-sync-${process.pid}.env`);
  fs.writeFileSync(tmp, `PREDICT_FUN_API_KEY=${key}\n`, { mode: 0o600 });
  try {
    run("scp", [...sshBase, tmp, `root@${host}:/tmp/pf-sync.env`]);
    run("ssh", [...sshBase, `root@${host}`,
      "set -a; . /tmp/pf-sync.env; set +a; rm -f /tmp/pf-sync.env; cd /root/changmen && bash deploy/scripts/sync-hk-relay-env-remote.sh",
    ]);
    console.log(`== probe upstream (${host}) ==`);
    run("ssh", [...sshBase, `root@${host}`,
      "cd /root/changmen/server/backend && node scripts/probe-hk-relay.mjs --upstream-only",
    ]);
  }
  finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
  console.log(`OK ${host}`);
}
