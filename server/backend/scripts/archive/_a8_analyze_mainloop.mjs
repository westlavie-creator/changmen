#!/usr/bin/env node
import fs from "node:fs";

const c = fs.readFileSync(process.argv[2] || "D:/River/arb/changmen/A8/index0706.js", "utf8");

// Find odds store: class _n and surrounding wp or reactive map
const nIdx = c.indexOf("class _n{");
console.log("=== class _n (OddsEntry) ===");
console.log(c.slice(nIdx, nIdx + 400));

// p.clean - find definition of p
const cleanIdx = c.indexOf("p.clean()");
const before = c.slice(Math.max(0, cleanIdx - 3000), cleanIdx);
const pDef = [...before.matchAll(/\b(p)\s*=\s*(\w+)\(\)/g)].pop();
console.log("\n=== p before clean ===");
console.log("last p assign:", pDef ? pDef[0] : "none");
console.log(before.slice(-500).replace(/\s+/g, " "));

// g config - find g = 
for (const pat of ["g=Ha()", "g=Pn()", "const g=", "g.config"]) {
  const i = c.indexOf(pat);
  if (i >= 0) console.log(pat, "at", i, "->", c.slice(i, i + 120).replace(/\s+/g, " "));
}

// Main loop function - search for finally with wait(100)
const fin = c.indexOf("finally{x&&p.clean(),await dt.wait(100)");
console.log("\n=== main loop finally at", fin, "===");
console.log(c.slice(fin - 2500, fin + 400).replace(/\s+/g, " ").slice(0, 2000));

// Where is P defined as main loop - search O(),P=
const mainLoop = c.indexOf("return O(),{matchs:t");
console.log("\n=== match store return (main loop start) ===");
console.log(c.slice(mainLoop - 500, mainLoop + 200).replace(/\s+/g, " "));

// Ut API client
const utIdx = c.indexOf("saveOrderBind:async");
console.log("\n=== Ut API client ===");
console.log(c.slice(utIdx - 100, utIdx + 400).replace(/\s+/g, " "));
