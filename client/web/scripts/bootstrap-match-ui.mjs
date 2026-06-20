/**
 * 从 modules/{match-list,bet-row}.css 抽取规则 → src/styles/
 * 用法：node scripts/bootstrap-match-ui.mjs [match-list|bet-row|all]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const SPECS = {
  "match-list": {
    src: "public/copy/styles/modules/match-list.css",
    out: "src/styles/match-list.css",
    header: `/**
 * changmen 赛事列表容器（仅 modules 加载；legacy 仍走 a8.css）
 * DOM 保持 A8 class：.matchs / .match / .match-title
 * 维护：改此文件后 node public/copy/sync-styles.mjs
 */

`,
  },
  "bet-row": {
    src: "public/copy/styles/modules/bet-row.css",
    out: "src/styles/bet-row.css",
    header: `/**
 * changmen 赛事卡赔率行（仅 modules 加载；legacy 仍走 a8.css）
 * DOM 保持 A8 class：.bet / .bet-items / .item-odds
 * 侧栏 .orders .bet 泄漏由 sidebar-orders.css（栈末）覆盖
 * 维护：改此文件后 node public/copy/sync-styles.mjs
 */

`,
    scopePrefix: ".matchs ",
  },
};

function parseRules(css) {
  const body = css.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
  const rules = [];
  const re = /([^{]+)\{([^}]*)}/g;
  let m;
  while ((m = re.exec(body))) {
    rules.push({ sel: m[1].trim(), decl: m[2].trim() });
  }
  return rules;
}

function fmtDecl(decl) {
  const trimmed = decl.trim();
  if (!trimmed) return "";
  return `  ${trimmed.endsWith(";") ? trimmed : `${trimmed};`}`;
}

function scopeBetRowSelector(sel, useScope) {
  if (!useScope) return sel;
  return sel
    .split(",")
    .map((part) => part.trim().replace(/^\.bet(?=\b|[.\s#\[:])/, ".matchs .bet"))
    .join(",\n");
}

function bootstrap(name) {
  const spec = SPECS[name];
  const srcPath = path.join(webRoot, spec.src);
  if (!fs.existsSync(srcPath)) {
    console.error(`[bootstrap-match-ui] missing ${spec.src} — run extract-a8-to-modules.mjs first`);
    process.exit(1);
  }
  const rules = parseRules(fs.readFileSync(srcPath, "utf8"));
  const blocks = rules
    .map((r) => {
      const sel = scopeBetRowSelector(r.sel, Boolean(spec.scopePrefix));
      return `${sel} {\n${fmtDecl(r.decl)}\n}`;
    })
    .join("\n\n");
  fs.writeFileSync(path.join(webRoot, spec.out), spec.header + blocks + "\n");
  console.log(`[bootstrap-match-ui] ${name}: ${rules.length} rules -> ${spec.out}`);
}

const arg = process.argv[2] ?? "all";
const names = arg === "all" ? Object.keys(SPECS) : [arg];
for (const name of names) {
  if (!SPECS[name]) {
    console.error(`[bootstrap-match-ui] unknown bucket: ${name}`);
    process.exit(1);
  }
  bootstrap(name);
}
