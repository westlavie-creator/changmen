#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync(
  "c:/Users/mints/Documents/gamebet/A8/A8frontendscipts/2.0.1/index.js",
  "utf8",
);

function count(re) {
  const m = s.match(re);
  return m ? m.length : 0;
}

const aliases = {
  OB: "NMe",
  RAY: "Kl",
  TF: "Uf",
  IA: "wy",
  IMT: "ei",
  PB: "Oi",
  SABA: "ks",
  Stake: "ra",
  HG: "fB",
};

console.log("=== getPlatform(alias) ===");
for (const [p, a] of Object.entries(aliases)) {
  const n = count(new RegExp(`getPlatform\\(${a}\\)`, "g"));
  if (n) console.log(p, `alias ${a}:`, n);
}

console.log("\n=== getPlatform(Xt.P) ===");
for (const p of Object.keys(aliases).concat(["IM", "XBet"])) {
  const n = count(new RegExp(`getPlatform\\(Xt\\.${p}\\)`, "g"));
  if (n) console.log(p, n);
}

console.log("\n=== updatePlatform ===");
for (const p of Object.keys(aliases).concat(["IM", "XBet"])) {
  const n = count(new RegExp(`updatePlatform\\(\\{provider:Xt\\.${p}`, "g"));
  if (n) console.log(p, n);
}

function dump(label, marker, len) {
  const i = s.indexOf(marker);
  if (i < 0) {
    console.log(label, "NOT FOUND");
    return;
  }
  console.log(`\n=== ${label} @ ${i} ===`);
  console.log(s.slice(i, i + (len || 500)).replace(/\n/g, " "));
}

dump("OB collector UMe", "UMe=async", 350);
dump("RAY vQe", "vQe=async", 380);
dump("IA wQe", "wQe=async", 420);
dump("TF UBe", "UBe=async", 280);
dump("PB AQ", "AQ=async", 380);
dump("IMT Pee", "Pee=async", 420);
dump("Stake MQ", "MQ=async", 380);
dump("SABA collect", "getPlatform(Xt.SABA)", 350);
dump("Socket hub", 'emit("join room",Xt.IM)', 280);

console.log("\n=== Provider classes ===");
for (const m of s.matchAll(/class (\w+) extends Lu/g)) {
  const cls = m[1];
  const idx = s.indexOf(`class ${cls} extends Lu`);
  const head = s.slice(Math.max(0, idx - 120), idx);
  const prov = head.match(/Xt\.\w+/g);
  const bet = s.slice(idx, idx + 800).match(/async betting\([^)]*\)[^{]{0,120}/);
  console.log(cls, prov ? [...new Set(prov)].join(" ") : "-", bet ? bet[0].slice(0, 80) : "");
}
