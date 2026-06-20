/**
 * 从 element-plus/dist/index.css 同步 EP 官方主题 → src/styles/ep-chalk.css
 * modules 皮肤用（替代 A8 extract / a8-all）；legacy 仍走 a8.css
 * 用法：node scripts/bootstrap-ep-chalk.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const epChalkCandidates = [
  path.join(webRoot, "../../node_modules/element-plus/dist/index.css"),
  path.join(webRoot, "../node_modules/element-plus/dist/index.css"),
];
const epChalkSrc = epChalkCandidates.find((p) => fs.existsSync(p));
const outPath = path.join(webRoot, "src/styles/ep-chalk.css");

const header = `/**
 * Element Plus 官方主题（element-plus/dist/index.css）
 * 仅 modules 加载；legacy 仍走 a8.css
 * 维护：npm 升级 element-plus 后重跑 node scripts/bootstrap-ep-chalk.mjs
 */

`;

if (!epChalkSrc) {
  console.error("[bootstrap-ep-chalk] missing element-plus dist/index.css; tried:", epChalkCandidates.join(", "));
  process.exit(1);
}

const body = fs.readFileSync(epChalkSrc, "utf8").trim();
fs.writeFileSync(outPath, `${header}${body}\n`);
console.log(`[bootstrap-ep-chalk] wrote ${path.relative(webRoot, outPath)} (${body.length} bytes)`);
