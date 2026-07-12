#!/usr/bin/env node
/**
 * Find import cycles and cross-platform edges in client/venue-adapter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../venue-adapter");
const exts = [".ts", ".tsx", ".js", ".mjs"];
const skip = new Set(["node_modules", "dist"]);

function resolveImport(fromFile, spec) {
  if (!spec.startsWith("@venue/") && !spec.startsWith("./") && !spec.startsWith("../")) {
    return null;
  }
  let target;
  if (spec.startsWith("@venue/")) {
    target = path.join(root, spec.slice("@venue/".length));
  } else {
    target = path.resolve(path.dirname(fromFile), spec);
  }
  const cands = [target, target + ".ts", target + ".tsx", path.join(target, "index.ts")];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  }
  return null;
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (exts.some((e) => ent.name.endsWith(e))) files.push(p);
  }
  return files;
}

const files = walk(root);
const graph = new Map();
const importRe =
  /import\s+(?:type\s+)?(?:[\w*\s{},$]+\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g;

for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, "/");
  const mod = rel.replace(/\.(ts|tsx|js|mjs)$/, "");
  if (!graph.has(mod)) graph.set(mod, new Set());
  const content = fs.readFileSync(f, "utf8");
  let m;
  while ((m = importRe.exec(content))) {
    const spec = m[1] || m[2];
    const resolved = resolveImport(f, spec);
    if (!resolved) continue;
    const to = path
      .relative(root, resolved)
      .replace(/\\/g, "/")
      .replace(/\.(ts|tsx|js|mjs)$/, "");
    if (to === mod) continue;
    graph.get(mod).add(to);
  }
}

const cycles = [];
const stack = [];
const inStack = new Set();
const visited = new Set();

function dfs(node) {
  if (inStack.has(node)) {
    const idx = stack.indexOf(node);
    cycles.push(stack.slice(idx).concat(node));
    return;
  }
  if (visited.has(node)) return;
  visited.add(node);
  inStack.add(node);
  stack.push(node);
  for (const nxt of graph.get(node) || []) {
    dfs(nxt);
  }
  stack.pop();
  inStack.delete(node);
}

for (const n of graph.keys()) dfs(n);

const seen = new Set();
const uniq = [];
for (const c of cycles) {
  const norm = [...c].sort().join("->");
  if (!seen.has(norm)) {
    seen.add(norm);
    uniq.push(c);
  }
}

console.log("Modules:", graph.size);
console.log("Cycles found:", uniq.length);
for (const c of uniq) {
  console.log("\n" + c.join(" -> "));
}

console.log("\n=== CROSS-CHUNK CYCLES (shared/registry/contract/adaptation = main) ===");
const chunkOf = (mod) => {
  const dir = mod.split("/")[0];
  if (dir === "shared" || dir === "contract") return "venue-shared";
  if (!dir || dir === "registry" || dir === "adaptation" || dir === "loader" || dir === "scripts")
    return "main";
  return `venue-${dir}`;
};
const chunkGraph = new Map();
for (const [from, tos] of graph) {
  const cf = chunkOf(from);
  if (!chunkGraph.has(cf)) chunkGraph.set(cf, new Set());
  for (const to of tos) {
    chunkGraph.get(cf).add(chunkOf(to));
  }
}
const chunkCycles = [];
const cStack = [];
const cInStack = new Set();
const cVisited = new Set();
function chunkDfs(node) {
  if (cInStack.has(node)) {
    const idx = cStack.indexOf(node);
    chunkCycles.push(cStack.slice(idx).concat(node));
    return;
  }
  if (cVisited.has(node)) return;
  cVisited.add(node);
  cInStack.add(node);
  cStack.push(node);
  for (const nxt of chunkGraph.get(node) || []) chunkDfs(nxt);
  cStack.pop();
  cInStack.delete(node);
}
for (const n of chunkGraph.keys()) chunkDfs(n);
const cSeen = new Set();
for (const c of chunkCycles) {
  const norm = [...c].sort().join("->");
  if (!cSeen.has(norm)) {
    cSeen.add(norm);
    console.log(c.join(" -> "));
  }
}
if (!cSeen.size) console.log("(none)");

console.log("\n=== venue-shared <-> platform edges ===");
for (const [from, tos] of graph) {
  const cf = chunkOf(from);
  for (const to of tos) {
    const ct = chunkOf(to);
    if (cf === "venue-shared" && ct.startsWith("venue-") && ct !== "venue-shared") {
      console.log(`${from} -> ${to} (${ct})`);
    }
    if (ct === "venue-shared" && cf.startsWith("venue-") && cf !== "venue-shared") {
      console.log(`${from} -> ${to} (venue-shared)`);
    }
  }
}

console.log("\n=== CROSS-PLATFORM IMPORTS ===");
const platformOf = (mod) => mod.split("/")[0];
const neutral = new Set(["registry", "contract", "shared", "adaptation", "loader", "scripts"]);

for (const [from, tos] of graph) {
  const pf = platformOf(from);
  for (const to of tos) {
    const pt = platformOf(to);
    if (pf === "shared" && !neutral.has(pt)) {
      console.log(`[shared->platform] ${from} -> ${to}`);
    } else if (!neutral.has(pf) && !neutral.has(pt) && pf !== pt) {
      console.log(`[platform->platform] ${from} -> ${to}`);
    }
  }
}
