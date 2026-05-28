#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const bundlePath = path.join(
  __dirname,
  "../../A8/A8frontendscipts/2.0.1/index.js",
);
const s = fs.readFileSync(bundlePath, "utf8");

function excerpt(anchor, before = 220, after = 520, label = anchor) {
  const i = s.indexOf(anchor);
  if (i < 0) {
    console.log("\nMISSING:", label);
    return null;
  }
  console.log(`\n===== ${label} @${i} =====`);
  console.log(s.slice(Math.max(0, i - before), i + after));
  return i;
}

console.log("bundle:", bundlePath);
console.log("size MB:", (s.length / 1e6).toFixed(2));

// 1) Demo login URL constant
excerpt("djtop-capi.v662n.com", 100, 350, "demo login URL (gY)");

// 2) $Me function body - search for pattern after gY assignment area
const meAnchor = s.indexOf("searchParams.get(\"token\")");
excerpt("searchParams.get(\"token\")", 400, 280, "$Me: parse token from pc URL");

// 3) All updatePlatform with OB
const obUpdate = 'updatePlatform({provider:Xt.OB';
let pos = 0;
let n = 0;
while (true) {
  const i = s.indexOf(obUpdate, pos);
  if (i < 0) break;
  n++;
  excerpt(obUpdate, 120, 180, `updatePlatform OB #${n}`);
  pos = i + obUpdate.length;
}
console.log("\nTotal updatePlatform({provider:Xt.OB occurrences:", n);

// 4) token invalid branch
excerpt('data==="token"', 450, 320, 'game/index token error -> $Me');

// 5) getPlatform definition
excerpt("Client_GetCollectPlatform", 120, 420, "Vt.getPlatform -> Client_GetCollectPlatform");

// 6) Collect loop uses getPlatform
excerpt("getPlatform(Xt.OB)", 250, 650, "OB collector getPlatform + game/index");

// 7) Demo button UserCollect - window.open pc
const openPc = s.indexOf("window.open(h.data.pc");
if (openPc >= 0) {
  excerpt("window.open(h.data.pc", 500, 200, "试玩按钮 open pc (no updatePlatform)");
} else {
  console.log("\nMISSING: window.open(h.data.pc");
}

// 8) Count get(gY) / Rr.get with demo url
const demoUrl = "djtop-capi.v662n.com/cApi/v2/member/login";
let gCount = 0;
let p = 0;
while (true) {
  const i = s.indexOf(demoUrl, p);
  if (i < 0) break;
  gCount++;
  p = i + demoUrl.length;
}
console.log("\nDemo login URL string occurrences:", gCount);

// 9) Any other OB token write?
for (const pat of [
  "updatePlatform({provider:Xt.OB,gateway",
  "updatePlatform({provider:Xt.OB,token",
  "API_UpdatePlatform",
]) {
  console.log(pat, "count", s.split(pat).length - 1);
}

// 10) SABA sync from account for comparison
const saba = "updatePlatform({provider:Xt.SABA";
if (s.includes(saba)) {
  excerpt(saba, 200, 300, "SABA updatePlatform (has gateway sync - contrast)");
}
