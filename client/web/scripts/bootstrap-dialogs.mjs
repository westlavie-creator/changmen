/**
 * 阶段 C 校验：dialogs 相关 changmen 补丁是否齐全（不生成 CSS，仅 predev 门禁）
 * 用法：node scripts/bootstrap-dialogs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const REQUIRED = [
  ["src/styles/user-diag.css", [".user-diag-dialog", ".googlecode"]],
  ["src/styles/ep-fallback.css", [".el-tabs.el-tabs--top", "column"]],
];

let failed = 0;
for (const [rel, needles] of REQUIRED) {
  const p = path.join(webRoot, rel);
  if (!fs.existsSync(p)) {
    console.error(`[bootstrap-dialogs] missing ${rel}`);
    failed += 1;
    continue;
  }
  const css = fs.readFileSync(p, "utf8");
  for (const n of needles) {
    if (!css.includes(n)) {
      console.error(`[bootstrap-dialogs] ${rel} missing ${n}`);
      failed += 1;
    }
  }
}

if (failed) {
  console.error(`[bootstrap-dialogs] FAILED (${failed} issue(s))`);
  process.exit(1);
}

console.log("[bootstrap-dialogs] changmen dialog patches OK");
