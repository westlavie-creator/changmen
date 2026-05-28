import fs from "fs";
const css = fs.readFileSync("gamebet_frontend/app/src/styles/a8.css", "utf8");
for (const key of ["provider-sort", "drag-item", ".el-form", ".el-switch", "fieldset", "CDe"]) {
  let idx = 0;
  let count = 0;
  while ((idx = css.indexOf(key, idx)) >= 0 && count < 3) {
    console.log("\n---", key, "at", idx, "---");
    console.log(css.slice(Math.max(0, idx - 20), idx + 200));
    idx += key.length;
    count++;
  }
}
