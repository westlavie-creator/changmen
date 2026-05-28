import fs from "fs";

const s = fs.readFileSync(
  "c:/Users/mints/Documents/gamebet/A8/A8frontendscipts/2.0.1/index.js",
  "utf8",
);

const markers = [
  "dy=Xt.IM",
  "EZe",
  "GetBetInfoSingleV2",
  "PlaceBetV2",
  "ExtendSession",
  "GetMemberBalance",
  "GetPendingWager",
  "GetStatement",
  "wZe=",
  "bZe=",
  "Wy=",
  "cZe=",
  "provider:Xt.IM",
  "Xt.IM,",
  "Xt.IM)",
  "Xt.IM}",
  "channel:\"IM\"",
  'channel:"IM"',
  "EZ(",
  "startIM",
  "IMService",
];

console.log("=== marker positions ===");
for (const m of markers) {
  let idx = 0;
  let n = 0;
  while ((idx = s.indexOf(m, idx)) !== -1 && n < 5) {
    console.log(`${m} @ ${idx}`);
    n++;
    idx += m.length;
  }
}

let anchor = s.indexOf("dy=Xt.IM");
if (anchor < 0) anchor = s.indexOf("GetBetInfoSingleV2") - 2000;
if (anchor < 0) {
  console.error("IM anchor not found");
  process.exit(1);
}
console.log("anchor", anchor);

const chunk = s.slice(anchor, anchor + 25000);
console.log("\n=== APIs in IM provider chunk ===");
const apis = new Set();
for (const m of chunk.matchAll(/"(\/api\/[^"]+)"/g)) apis.add(m[1]);
console.log([...apis].sort().join("\n"));

console.log("\n=== first 8000 chars from dy=Xt.IM ===");
console.log(chunk.slice(0, 8000));

// find class extends Lu near IM
const classIdx = s.indexOf("class", anchor - 500);
console.log("\n=== search getOrders near IM ===");
for (const pat of ["getOrders", "getBalance", "checkBet", "betting", "updateOrders"]) {
  const i = s.indexOf(pat, anchor);
  if (i >= 0 && i < anchor + 30000) {
    console.log(pat, "@", i, s.slice(i, i + 200).replace(/\n/g, " "));
  }
}
