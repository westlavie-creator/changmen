import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, "../../A8/A8frontendscipts/index.js");
const s = fs.readFileSync(bundlePath, "utf8");
const idx = s.indexOf("EDe=Se");
console.log("EDe idx", idx);
if (idx >= 0) {
  const chunk = s.slice(idx, idx + 15000);
  console.log(chunk);
}
for (const label of ["投注金额", "开启投注", "定时打开", "场馆", "秒出", "十位", "补单", "排序"]) {
  const i = s.indexOf(label);
  if (i >= 0) console.log(label, i);
}
