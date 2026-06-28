/**
 * 从 src/styles/a8.css 抽取 changmen 业务杂项 → src/styles/misc.css
 * 用法：node scripts/bootstrap-misc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const a8Path = path.join(webRoot, "src/styles/a8.css");
const outPath = path.join(webRoot, "src/styles/misc.css");

function parseTopLevelRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    const start = i;
    let depth = 0;
    while (i < css.length) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          rules.push(css.slice(start, i));
          break;
        }
      }
      i++;
    }
    if (depth !== 0) break;
  }
  return rules;
}

function selectorOf(rule) {
  const idx = rule.indexOf("{");
  if (idx === -1) return rule.trim();
  return rule.slice(0, idx).trim();
}

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

function isChangmenMiscSelector(sel) {
  if (/^#app \.el-aside|^\.common-layout \.el-aside|\.providers|^\.userinfo|^\.report-number/.test(sel)) {
    return false;
  }
  return /^fieldset|^p$|^p\{|^p |^p,|\.tip|\.container|\.currency|\.text-center|\.text-overflow|\.iconfont|\.login-|^\.loginbox|\.tags|\.report|\.pageSplit|\.parse|\.submit|\.moneyValue|\.hacked|\.Withdraw|\.rank|\.credit|\.top|\.message|\.wallets|\.date/.test(sel);
}

const header = `/**
 * changmen 业务杂项
 * fieldset / currency / rank / 登录容器 / 用户诊断 Tab 等 A8 非 EP class
 * 维护：改此文件后 node scripts/sync-style-assets.mjs
 */

`;

const css = fs.readFileSync(a8Path, "utf8").replace(/^@charset[^;]+;/, "");
const kept = parseTopLevelRules(css).filter((r) => isChangmenMiscSelector(selectorOf(r)));
const blocks = kept
  .map((r) => {
    const sel = selectorOf(r);
    return `${sel} {\n${fmtDecl(patchDecl(sel, declOf(r)))}\n}`;
  })
  .join("\n\n");

fs.writeFileSync(outPath, `${header}${blocks}\n`);
console.log(`[bootstrap-misc] wrote ${kept.length} rules -> ${path.relative(webRoot, outPath)}`);
