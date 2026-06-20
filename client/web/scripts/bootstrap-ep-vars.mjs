/**
 * 从 element-plus/theme-chalk/el-var.css 同步 EP :root 变量 → src/styles/ep-vars.css
 * modules 皮肤用；legacy 仍走 a8.css 整包
 * 用法：node scripts/bootstrap-ep-vars.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const epVarCandidates = [
  path.join(webRoot, "../../node_modules/element-plus/theme-chalk/el-var.css"),
  path.join(webRoot, "../node_modules/element-plus/theme-chalk/el-var.css"),
];
const epVarSrc = epVarCandidates.find((p) => fs.existsSync(p));
const outPath = path.join(webRoot, "src/styles/ep-vars.css");

const header = `/**
 * Element Plus :root 设计变量（仅 modules 加载；legacy 仍走 a8.css）
 * 源：element-plus/theme-chalk/el-var.css（npm run 前由 bootstrap-ep-vars.mjs 同步）
 * 维护：npm 升级 element-plus 后重跑 node scripts/bootstrap-ep-vars.mjs
 */

`;

if (!epVarSrc) {
  console.error("[bootstrap-ep-vars] missing element-plus el-var.css; tried:", epVarCandidates.join(", "));
  process.exit(1);
}

const body = fs.readFileSync(epVarSrc, "utf8").trim();
fs.writeFileSync(outPath, `${header}${body}\n`);
console.log(`[bootstrap-ep-vars] wrote ${path.relative(webRoot, outPath)} (${body.length} bytes)`);
