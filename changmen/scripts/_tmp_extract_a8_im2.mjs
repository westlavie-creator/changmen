import fs from "fs";

const s = fs.readFileSync(
  "c:/Users/mints/Documents/gamebet/A8/A8frontendscipts/2.0.1/index.js",
  "utf8",
);

// EZe collect @ ~1006352
const collectAnchor = s.indexOf("EZe", 1_000_000);
console.log("=== COLLECT EZe chunk @", collectAnchor, "===");
console.log(s.slice(collectAnchor - 200, collectAnchor + 6000));

// Provider class - search class extends Lu before GetBetInfoSingleV2
const provAnchor = s.indexOf("GetBetInfoSingleV2") - 3000;
console.log("\n=== PROVIDER chunk @", provAnchor, "===");
const provChunk = s.slice(provAnchor, provAnchor + 12000);
console.log(provChunk);

// getOrders for IM
for (const pat of ["getOrders", "GetBetList", "GetPending", "GetStatement", "GetWager"]) {
  let idx = provAnchor;
  while ((idx = s.indexOf(pat, idx)) !== -1 && idx < provAnchor + 50000) {
    console.log("\n---", pat, "@", idx, "---");
    console.log(s.slice(idx - 80, idx + 400).replace(/\n/g, " "));
    idx += pat.length;
    break;
  }
}

// Wy headers
const wy = s.indexOf("Wy=");
console.log("\n=== Wy @", wy, "===");
console.log(s.slice(wy, wy + 800));

// b0 sport map near wZe
const wz = s.indexOf("wZe=");
console.log("\n=== wZe area @", wz, "===");
console.log(s.slice(wz - 1500, wz + 500));
