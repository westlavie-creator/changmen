import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, "../../A8/A8frontendscipts/index.js");
const s = fs.readFileSync(bundlePath, "utf8");
const re = /[\u4e00-\u9fff]{2,}/g;
const set = new Set();
for (const m of s.matchAll(re)) set.add(m[0]);
console.log([...set].slice(0, 50));
