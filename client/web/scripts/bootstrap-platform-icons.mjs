/**
 * 从 modules/platform-icons.css 抽取 .provider-icon 规则 → src/styles/platform-icons.css
 * 用法：node scripts/bootstrap-platform-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const srcPath = path.join(webRoot, "public/copy/styles/modules/platform-icons.css");
const outPath = path.join(webRoot, "src/styles/platform-icons.css");

const raw = fs.readFileSync(srcPath, "utf8");
const body = raw.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
const rules = [];
const re = /([^{]+)\{([^}]*)\}/g;
let m;
while ((m = re.exec(body))) {
  const sel = m[1].trim();
  if (!sel.includes("provider-icon")) continue;
  rules.push({ sel, decl: m[2].trim() });
}

function expandSelector(sel) {
  const cm = sel.replace(/\.provider-icon/g, ".cm-platform-icon");
  if (cm === sel) return sel;
  return `${cm},\n${sel}`;
}

function formatDecl(decl) {
  const trimmed = decl.trim();
  return `  ${trimmed.endsWith(";") ? trimmed : `${trimmed};`}`;
}

const blocks = rules.map(
  ({ sel, decl }) => `${expandSelector(sel)} {\n${formatDecl(decl)}\n}`,
);

blocks.push(
  `.cm-platform-icon.OB.limit,
.provider-icon.OB.limit {
  outline: 2px solid #f59e0b;
  outline-offset: -1px;
}`,
);

const header = `/**
 * changmen 平台角标（从 A8 extract 独立；modules + legacy 均经 sync 加载）
 * 维护：改此文件后 node public/copy/sync-styles.mjs
 * 推荐 class：cm-platform-icon；.provider-icon 为过渡别名
 */

`;

fs.writeFileSync(outPath, header + blocks.join("\n\n") + "\n");
console.log(`[bootstrap-platform-icons] wrote ${blocks.length} rule block(s) -> src/styles/platform-icons.css`);
