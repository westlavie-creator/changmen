import fs from "node:fs";
const c = fs.readFileSync("d:/River/arb/gamebet/A8/A8frontendscipts/2.0.1/index.js", "utf8");
const patterns = ["getPlatform(", "Ut.getPlatform", "Client_GetCollectPlatform", "Ar.post("];
for (const p of patterns) {
  const n = c.split(p).length - 1;
  console.log(p, "count:", n);
}
const idx = c.indexOf("getPlatform:async");
console.log("\nUt.getPlatform def:", c.slice(idx, idx + 400));
// OB poll area
const ob = c.indexOf("f8e=qt.OB");
console.log("\nOB area sample:", c.slice(ob, ob + 2500));
