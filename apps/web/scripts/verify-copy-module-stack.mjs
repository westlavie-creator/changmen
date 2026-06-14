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
const manifestPath = path.join(webRoot, "public/copy/styles/modules/segments/manifest.json");
const a8AllPath = path.join(webRoot, "public/copy/styles/modules/a8-all.css");
const legacyA8Path = path.join(webRoot, "public/copy/styles/legacy/a8.css");

let failed = 0;

for (const [, outName] of CHANGMEN_MODULE_MAP) {
  const p = path.join(changmenDir, outName);
  if (!fs.existsSync(p)) {
    console.error("[verify-copy-modules] missing", path.relative(webRoot, p));
    failed += 1;
  }
}

if (!fs.existsSync(manifestPath)) {
  console.error("[verify-copy-modules] missing segments/manifest.json — run extract-a8-to-modules.mjs");
  failed += 1;
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.files?.length) {
    console.error("[verify-copy-modules] empty segments manifest");
    failed += 1;
  } else {
    console.log(`[verify-copy-modules] segments: ${manifest.files.length} files, ${manifest.ruleCount} rules`);
  }
}

if (!fs.existsSync(a8AllPath)) {
  console.warn("[verify-copy-modules] missing a8-all.css fallback");
} else if (fs.existsSync(legacyA8Path)) {
  const a = fs.statSync(a8AllPath).size;
  const b = fs.statSync(legacyA8Path).size;
  const diff = Math.abs(a - b);
  if (diff > 500) {
    console.warn(`[verify-copy-modules] a8-all vs legacy/a8 size delta ${diff} bytes — re-run extract`);
  }
}

if (failed) {
  console.error(`[verify-copy-modules] FAILED (${failed} issue(s))`);
  process.exit(1);
}

console.log("[verify-copy-modules] OK");
