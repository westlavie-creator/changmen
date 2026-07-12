#!/usr/bin/env node
import fs from "node:fs";

const c = fs.readFileSync(process.argv[2] || "D:/River/arb/changmen/A8/index0706.js", "utf8");

// odds pinia or plain object with clean/save
for (const needle of ['wp("odds"', ".save(", "clean()", "getOdds(", "fo=wp", "p=wp", "const p="]) {
  let count = 0;
  let idx = 0;
  while ((idx = c.indexOf(needle, idx)) !== -1 && count < 3) {
    if (needle === ".save(" || needle === "getOdds(") {
      idx += needle.length;
      continue;
    }
    console.log(`\n=== ${needle} @ ${idx} ===`);
    console.log(c.slice(idx, idx + 300).replace(/\s+/g, " "));
    idx += needle.length;
    count++;
  }
}

// Find p= assignment near match store - search backwards from p.clean
const cleanIdx = c.indexOf("p.clean()");
const chunk = c.slice(cleanIdx - 8000, cleanIdx);
const assigns = [...chunk.matchAll(/\b([a-z])\s*=\s*([a-zA-Z_$][\w$]*)\(\)/g)];
console.log("\n=== single-letter vars before p.clean (last 20) ===");
for (const m of assigns.slice(-20)) console.log(`  ${m[1]} = ${m[2]}()`);

// user store has config
const pnIdx = c.indexOf('Pn=wp("user"');
console.log("\n=== user store Pn ===");
console.log(c.slice(pnIdx, pnIdx + 1200).replace(/\s+/g, " ").slice(0, 900));

// collect store Md
const mdIdx = c.indexOf('Md=wp("collect"');
console.log("\n=== collect store ===");
console.log(c.slice(mdIdx, mdIdx + 800).replace(/\s+/g, " "));

// Platform symbols - Xt.OB etc
const xt = c.match(/Xt=\{[^}]{0,3000}\}/);
if (xt) {
  const platforms = [...xt[0].matchAll(/(\w+):"([^"]+)"/g)];
  console.log("\n=== Xt platform ids ===");
  for (const [, k, v] of platforms) console.log(`  ${k}: ${v}`);
}
