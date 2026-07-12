#!/usr/bin/env node
import fs from "node:fs";

const path = process.argv[2] || "D:/River/arb/changmen/A8/index0706.js";
const c = fs.readFileSync(path, "utf8");

const stores = [...c.matchAll(/wp\("([^"]+)"/g)].map((m) => m[1]);
const storeCounts = {};
for (const s of stores) storeCounts[s] = (storeCounts[s] || 0) + 1;

console.log("=== Pinia stores ===");
for (const [k, v] of Object.entries(storeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

const apis = [...new Set([...c.matchAll(/Client_[A-Za-z]+/g)].map((m) => m[0]))].sort();
console.log(`\n=== Client_* APIs (${apis.length}) ===`);
console.log(apis.join(", "));

const apiSave = [...new Set([...c.matchAll(/API_[A-Za-z]+/g)].map((m) => m[0]))].sort();
console.log(`\n=== API_* (${apiSave.length}) ===`);
console.log(apiSave.join(", "));

// Provider const names in Gt
const gtMatch = c.match(/Gt=\{([^}]+)\}/);
if (gtMatch) {
  const providers = [...gtMatch[1].matchAll(/(\w+):"([^"]+)"/g)];
  console.log("\n=== Gt providers ===");
  for (const [, key, val] of providers) console.log(`  ${key}: ${val}`);
}

// Collect platform debug tags
const collectTags = [...new Set([...c.matchAll(/debug\(`\[(\w+)\]/g)].map((m) => m[1]))];
console.log("\n=== collect debug platform tags ===");
console.log(collectTags.join(", "));

// Key class names for domain models
const classes = [
  "class If",
  "class Jn",
  "class Ly",
  "class vx",
  "class qm",
  "class _n",
  "class IQ",
  "GetOrderOptions",
  "checkBetting",
  "updateOrders",
  "saveBets",
  "saveMatch",
];
console.log("\n=== key symbols (first occurrence index) ===");
for (const sym of classes) {
  const i = c.indexOf(sym);
  console.log(`  ${sym}: ${i >= 0 ? i : "N/A"}`);
}

// Find store assignment patterns hg=wp, fo=wp etc
const namedStores = [...c.matchAll(/(\w+)=wp\("([^"]+)"/g)];
console.log("\n=== named store vars ===");
const seen = new Set();
for (const [, varName, storeName] of namedStores) {
  const key = `${varName}=${storeName}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${varName} -> ${storeName}`);
}

// odds cache: class _n + .save pattern inside match store
const hgIdx = c.indexOf("hg=wp");
if (hgIdx >= 0) {
  const snippet = c.slice(hgIdx, hgIdx + 2500);
  const oddsVar = snippet.match(/(\w+)=wp\("match"[^]*?se\(new Map\)/);
  console.log("\n=== match store head (odds map) ===");
  console.log(snippet.slice(0, 800).replace(/\s+/g, " "));
}

// Main loop P inside Vg
const vgIdx = c.indexOf("Vg=");
if (vgIdx >= 0) {
  console.log("\n=== Vg snippet ===");
  console.log(c.slice(vgIdx, vgIdx + 600).replace(/\s+/g, " "));
}

// h alias for account store methods
for (const sym of ["h.checkBetting", "h.betting", "h.getAccount", "h.accounts", "Ut.saveOrderBind", "y.createOrder", "y.orders", "p.clean", "g.config.betting"]) {
  console.log(`  ${sym}: ${c.indexOf(sym)}`);
}

// Platform provider registry
const providerFns = [...new Set([...c.matchAll(/(\w+Provider)\s*=\s*\{/g)].map((m) => m[1]))];
console.log("\n=== *Provider objects ===");
console.log(providerFns.slice(0, 30).join(", "));

// Collect functions - look for start patterns
const collectStarts = [...new Set([...c.matchAll(/function (\w+)\(t\)\{[^]{0,80}collect/gi)].map((m) => m[1]))];
console.log("\n=== collect-like fn names (sample) ===");
console.log(collectStarts.slice(0, 15).join(", "));
