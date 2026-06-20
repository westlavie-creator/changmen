/**
 * 从 modules/account-bar.css 抽取规则 → src/styles/account-bar.css
 * 用法：node scripts/bootstrap-account-bar.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const srcPath = path.join(webRoot, "public/copy/styles/modules/account-bar.css");
const outPath = path.join(webRoot, "src/styles/account-bar.css");

const raw = fs.readFileSync(srcPath, "utf8");
const body = raw.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
const rules = [];
const re = /([^{]+)\{([^}]*)}/g;
let m;
while ((m = re.exec(body))) {
  rules.push({ sel: m[1].trim(), decl: m[2].trim() });
}

function expandSel(sel) {
  if (!sel.includes(".provider-icon")) return sel;
  const cm = sel.replace(/\.provider-icon/g, ".cm-platform-icon");
  if (cm === sel) return sel;
  return `${cm},\n${sel}`;
}

function fmtDecl(decl) {
  const trimmed = decl.trim();
  if (!trimmed) return "";
  return `  ${trimmed.endsWith(";") ? trimmed : `${trimmed};`}`;
}

const header = `/**
 * changmen 顶栏账号条（仅 modules 加载；legacy 仍走 a8.css）
 * DOM 保持 A8 class：.providers / .account / .platform
 * 维护：改此文件后 node public/copy/sync-styles.mjs
 */

`;

const blocks = rules
  .map((r) => `${expandSel(r.sel)} {\n${fmtDecl(r.decl)}\n}`)
  .join("\n\n");

fs.writeFileSync(outPath, header + blocks + "\n");
console.log(`[bootstrap-account-bar] wrote ${rules.length} rules -> ${path.relative(webRoot, outPath)}`);
