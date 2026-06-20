/**
 * 从 legacy/a8.css 抽取 element-misc 分桶 → src/styles/misc.css
 * 用法：node scripts/bootstrap-misc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bucketFor, parseTopLevelRules, selectorOf } from "./extract-a8-to-modules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const a8Path = path.join(webRoot, "public/copy/styles/legacy/a8.css");
const outPath = path.join(webRoot, "src/styles/misc.css");

function declOf(rule) {
  const start = rule.indexOf("{") + 1;
  const end = rule.lastIndexOf("}");
  return rule.slice(start, end).trim();
}

function fmtDecl(decl) {
  const trimmed = decl.trim();
  if (!trimmed) return "";
  return `  ${trimmed.endsWith(";") ? trimmed : `${trimmed};`}`;
}

function patchDecl(sel, decl) {
  if (/^\.moneyValue\.win\b/.test(sel)) {
    return decl.replace(/color:#67c23a/g, "color:var(--cm-color-success, #67c23a)");
  }
  if (/^\.moneyValue\.lose\b/.test(sel)) {
    return decl.replace(/color:#f56c6c/g, "color:var(--cm-color-danger, #f56c6c)");
  }
  if (/^\.moneyValue\b/.test(sel)) {
    return decl.replace(/color:#909399/g, "color:var(--cm-color-info, #909399)");
  }
  return decl;
}

const header = `/**
 * changmen 业务杂项（仅 modules 加载；legacy 仍走 a8.css）
 * fieldset / currency / rank / 登录容器 / 用户诊断 Tab 等 A8 非 EP class
 * 维护：改此文件后 node public/copy/sync-styles.mjs
 */

`;

const css = fs.readFileSync(a8Path, "utf8").replace(/^@charset[^;]+;/, "");
const kept = parseTopLevelRules(css).filter((r) => bucketFor(r) === "element-misc.css");
const blocks = kept
  .map((r) => {
    const sel = selectorOf(r);
    return `${sel} {\n${fmtDecl(patchDecl(sel, declOf(r)))}\n}`;
  })
  .join("\n\n");

fs.writeFileSync(outPath, `${header}${blocks}\n`);
console.log(`[bootstrap-misc] wrote ${kept.length} rules -> ${path.relative(webRoot, outPath)}`);
