#!/usr/bin/env node
/**
 * CI 闸：合场算法（compose/）禁止 import match-identity/merge（含 match_merge），
 * 也不得回调 matchMergeOnce —— 后者是它的调用方，反向依赖会形成第二写循环。
 *
 * 只扫 compose/：包内 ops/ link/ ui/ 属 matcher 调度侧，调用 matchMergeOnce 是正常的。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(pkgRoot, "compose");
const forbid = [
  /match-(?:engine|identity)[/\\]merge/,
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
  path.join(pkgRoot, "scripts", "check-no-merge-import.mjs"),
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
  console.error("[compose] forbidden merge imports:");
  for (const h of hits)
    console.error(`  compose/${h.file} ~ ${h.pattern}`);
  process.exit(1);
}
console.log("[compose] check-no-merge-import OK");
