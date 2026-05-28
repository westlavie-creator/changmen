import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, "../../A8/A8frontendscipts/index.js");

const s = fs.readFileSync(bundlePath, "utf8");
const i = s.indexOf("dy=Xt.IM");
console.log("pos", i);
const chunk = s.slice(i, i + 20000);
const apis = new Set();
for (const m of chunk.matchAll(/"(\/api\/[^"]+)"/g)) apis.add(m[1]);
console.log([...apis]);
