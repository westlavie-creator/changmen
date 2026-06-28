/**
 * 从 legacy/a8.css 抽取 layout 分桶非 @media 规则 → src/styles/layout.css
 * @media el-col 栅格仍留 extract layout 分桶
 * 用法：node scripts/bootstrap-layout.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const a8Path = path.join(webRoot, "src/styles/a8.css");
const outPath = path.join(webRoot, "src/styles/layout.css");

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

/** 与 extract layout 分桶一致，但不含 .el-*（那些先进 element-components） */
function isChangmenLayoutSelector(sel) {
  if (/^@media/.test(sel)) return false;
  return (
    /^(html|body|\*|#app|a,|aside|header|\.checking|random-|::-webkit|input\[type=number\])/.test(sel) ||
    /\.common-layout|\.home-view|\.flex|\.match-search|\.app-sidebar|\.app-hint|\.pos|\.neg/.test(sel)
  );
}

function fmtDecl(decl) {
  const trimmed = decl.trim();
  if (!trimmed) return "";
  return `  ${trimmed.endsWith(";") ? trimmed : `${trimmed};`}`;
}

function patchDecl(sel, decl) {
  if (/^body\b/.test(sel)) {
    return decl
      .replace(/background-color:#000000b3/g, "background-color:var(--cm-body-bg-overlay, #000000b3)")
      .replace(
        /background-image:url\(\/esport2\/assets\/B7Mt9vLb\.webp\)/g,
        "background-image:var(--cm-body-bg-image, url(/esport2/assets/B7Mt9vLb.webp))",
      )
      .replace(/font-family:asus/g, "font-family:var(--cm-font-body, asus)");
  }
  if (sel.trim() === "*") {
    return decl.replace(/font-family:asus/g, "font-family:var(--cm-font-body, asus)");
  }
  if (/^aside\b/.test(sel)) {
    return decl.replace(
      /background-image:url\(\/esport2\/assets\/XJqe1JME\.webp\)/g,
      "background-image:var(--cm-sidebar-bg-image, url(/esport2/assets/XJqe1JME.webp))",
    );
  }
  return decl;
}

const header = `/**
 * changmen 全局布局（仅 modules 加载；legacy 仍走 a8.css）
 * DOM 保持 A8 class：.flex / .common-layout / #app
 * @media el-col 栅格仍由 extract layout 分桶提供
 * 维护：改此文件后 node scripts/sync-style-assets.mjs
 */

`;

const css = fs.readFileSync(a8Path, "utf8").replace(/^@charset[^;]+;/, "");
const kept = parseTopLevelRules(css).filter((r) => isChangmenLayoutSelector(selectorOf(r)));
const blocks = kept.map((r) => `${selectorOf(r)} {\n${fmtDecl(patchDecl(selectorOf(r), declOf(r)))}\n}`).join("\n\n");

fs.writeFileSync(outPath, `${header}${blocks}\n`);
console.log(`[bootstrap-layout] wrote ${kept.length} rules -> ${path.relative(webRoot, outPath)}`);
