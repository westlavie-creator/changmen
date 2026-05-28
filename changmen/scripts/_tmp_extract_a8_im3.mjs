import fs from "fs";

const s = fs.readFileSync(
  "c:/Users/mints/Documents/gamebet/A8/A8frontendscipts/2.0.1/index.js",
  "utf8",
);

// Find all occurrences related to IM collect save
const patterns = [
  "Xt.IM",
  "saveMatch",
  "saveBets",
  "CZe",
  "DZe",
  "FZe",
  "GZe",
  "HZe",
  "IZe",
  "JZe",
  "KZe",
  "LZe",
  "MZe",
  "NZe",
  "PZe",
  "QZe",
  "RZe",
  "SZe",
  "TZe",
  "collect.get",
  "hh[yZe]",
  "imBetName",
  "BetName",
  "collapseIm",
  "map:",
  "IM_ODDS",
  "3*60",
  "10800",
  "180",
];

for (const pat of ["saveMatch(Xt.IM", "saveMatch(fy", "saveMatch(yZe", "Af().saveMatch", "Vt.saveMatch"]) {
  let idx = 0, n = 0;
  while ((idx = s.indexOf(pat, idx)) !== -1 && n < 5) {
    console.log("\n===", pat, "@", idx, "===");
    console.log(s.slice(idx - 100, idx + 500).replace(/\n/g, " "));
    idx += pat.length;
    n++;
  }
}

// Search IM-specific collect loop near CZe
const cze = s.indexOf("CZe=async");
console.log("\n=== after CZe full collect? search 50k ===");
const afterCze = s.slice(cze, cze + 80000);
for (const m of afterCze.matchAll(/async\s+\w+Ze\s*=\s*async/g)) {
  console.log("fn", m[0], "at offset", m.index);
}

// find parse im bet name functions
for (const pat of ["parseIm", "imBet", "GTName", "SName", "imSport", "SportId"]) {
  const idx = s.indexOf(pat, 2_600_000);
  if (idx > 0 && idx < 2_800_000) {
    console.log("\n---", pat, "@", idx, "---");
    console.log(s.slice(idx - 60, idx + 200));
  }
}
