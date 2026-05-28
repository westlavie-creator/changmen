import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, "../../A8/A8frontendscipts/index.js");
const s = fs.readFileSync(bundlePath, "utf8");
const m = s.match(/CDe=\{[^}]+\}/);
console.log(m?.[0]);
