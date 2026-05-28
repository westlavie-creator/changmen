import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "../../../gamebet_backend/public/esport2/assets/index.css");
const out = path.join(__dirname, "../src/styles/a8.css");

let css = fs.readFileSync(src, "utf8");
css = css.replace(/\[data-v-[a-f0-9]+\]/g, "");
css = css.replace(/url\(\.\//g, "url(/esport2/assets/");

fs.writeFileSync(out, css);
console.log(`Wrote ${out} (${css.length} bytes)`);
