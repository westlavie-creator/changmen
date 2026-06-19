import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "../../../server/backend/public/assets/index.css");
const out = path.join(__dirname, "../src/styles/a8.css");

if (!fs.existsSync(src)) {
  console.log(`[extract-a8-css] 源文件不存在，跳过（${src}）`);
  process.exit(0);
}
let css = fs.readFileSync(src, "utf8");
css = css.replace(/\[data-v-[a-f0-9]+\]/g, "");
css = css.replace(/url\(\.\//g, "url(/esport2/assets/");

fs.writeFileSync(out, css);
console.log(`Wrote ${out} (${css.length} bytes)`);
