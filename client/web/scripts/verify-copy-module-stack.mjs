/**
 * 检查 /copy modules 皮肤所需文件是否齐全。
 * 用法：node scripts/verify-copy-module-stack.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANGMEN_MODULE_MAP } from "./sync-copy-preview-styles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const changmenDir = path.join(webRoot, "public/copy/styles/modules/changmen");
const epChalkPath = path.join(changmenDir, "ep-chalk.css");

let failed = 0;

for (const [, outName] of CHANGMEN_MODULE_MAP) {
  const p = path.join(changmenDir, outName);
  if (!fs.existsSync(p)) {
    console.error("[verify-copy-modules] missing", path.relative(webRoot, p));
    failed += 1;
  }
}

if (!fs.existsSync(epChalkPath)) {
  console.error("[verify-copy-modules] missing ep-chalk.css — run bootstrap-ep-chalk.mjs && sync");
  failed += 1;
} else {
  const bytes = fs.statSync(epChalkPath).size;
  console.log(`[verify-copy-modules] ep-chalk.css: ${bytes} bytes`);
}

if (failed) {
  console.error(`[verify-copy-modules] FAILED (${failed} issue(s))`);
  process.exit(1);
}

console.log("[verify-copy-modules] OK (EP + changmen, no A8 extract)");
