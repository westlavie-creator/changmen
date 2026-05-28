import fs from "fs";

const s = fs.readFileSync(
  "c:/Users/mints/Documents/gamebet/A8/A8frontendscipts/2.0.1/index.js",
  "utf8",
);

console.log("=== saveMatch contexts with IM/fy ===");
let idx = 0;
while ((idx = s.indexOf("saveMatch", idx)) !== -1) {
  const ctx = s.slice(Math.max(0, idx - 250), idx + 350);
  if (/Xt\.IM|\bfy\b|yZe|IMService|channel.*IM/.test(ctx)) {
    console.log("\n--- @", idx, "---");
    console.log(ctx.replace(/\n/g, " "));
  }
  idx += 9;
}

console.log("\n=== search IM collect accumulator ===");
for (const pat of [
  "IMService",
  "startIm",
  "ImCollect",
  "imCollect",
  "saveMatchSource",
  "saveBetSource",
  "pp.data",
  "getBets:",
  "clean:t",
  "lastSeenAt",
  "collapse",
  "imBetName",
  "BetNameIs",
  "parseIm",
  "IM_ODDS",
  "10800000",
  "3*60*60",
  "180000",
]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(pat, i)) !== -1 && n < 3) {
    if (i > 1_000_000 && i < 3_000_000) {
      console.log(pat, "@", i, ":", s.slice(i, i + 100).replace(/\n/g, " "));
    }
    i += pat.length;
    n++;
  }
}

// Extract collect store r=async around 1297889
const storeIdx = s.indexOf("saveMatchSource");
console.log("\n=== collect store module @", storeIdx, "===");
console.log(s.slice(storeIdx - 500, storeIdx + 4000));
