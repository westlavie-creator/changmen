#!/usr/bin/env node
/**
 * CI 闸：match-composer 禁止 import match-engine/merge（含 match_merge）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbid = [
  /match-engine[/\\]merge/,
  /merge[/\\]match_merge/,
  /buildClientMatchList/,
  /buildMatchListMerged/,
  /finalizeClientMatchList/,
  /reconcileClientMatchReverse/,
  /refreshClientMatchSides/,
  /computeMatchMergeList/,
  /matchMergeOnce/,
];

const skipDirs = new Set(["node_modules", ".git", "dist", "coverage"]);
const skipFiles = new Set([
  path.join(root, "scripts", "check-no-merge-import.mjs"),
]);
const hits = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDirs.has(name))
      continue;
    const p = path.join(dir, name);
    if (skipFiles.has(p))
      continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(js|mjs|cjs|ts|tsx)$/.test(name))
      continue;
    const text = fs.readFileSync(p, "utf8");
    for (const re of forbid) {
      if (re.test(text))
        hits.push({ file: path.relative(root, p), pattern: String(re) });
    }
  }
}

walk(root);
if (hits.length) {
  console.error("[match-composer] forbidden merge imports:");
  for (const h of hits)
    console.error(`  ${h.file} ~ ${h.pattern}`);
  process.exit(1);
}
console.log("[match-composer] check-no-merge-import OK");
