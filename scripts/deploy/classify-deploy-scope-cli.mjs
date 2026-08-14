#!/usr/bin/env node
/**
 * CLI: print deploy scope for GHA / local scripts.
 * Usage:
 *   node scripts/deploy/classify-deploy-scope-cli.mjs --from SHA --to SHA
 *   node scripts/deploy/classify-deploy-scope-cli.mjs --full
 * Env: DEPLOY_FORCE_FULL=1
 */
import { execFileSync } from "node:child_process";
import { resolveDeployScope } from "./classify-deploy-scope.mjs";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1])
    return process.argv[i + 1];
  return fallback;
}

const forceFull = process.argv.includes("--full")
  || process.env.DEPLOY_FORCE_FULL === "1"
  || process.env.DEPLOY_FULL === "1";

const from = arg("--from", process.env.DEPLOY_FROM_SHA || "");
const to = arg("--to", process.env.DEPLOY_TO_SHA || "HEAD");

const result = resolveDeployScope({
  from,
  to,
  forceFull,
  execFileSync,
});

const githubOut = process.env.GITHUB_OUTPUT;
if (githubOut) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(githubOut, `scope=${result.scope}\n`);
  appendFileSync(githubOut, `reason=${result.reason}\n`);
  appendFileSync(githubOut, `frontend=${result.scope === "frontend" || result.scope === "full"}\n`);
  appendFileSync(githubOut, `backend=${result.scope === "backend" || result.scope === "full"}\n`);
  appendFileSync(githubOut, `noop=${result.scope === "noop"}\n`);
}

console.log(JSON.stringify({
  scope: result.scope,
  reason: result.reason,
  pathCount: result.paths.length,
  paths: result.paths.slice(0, 40),
}, null, 2));
