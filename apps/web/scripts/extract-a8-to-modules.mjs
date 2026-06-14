/**
 * 从 public/copy/styles/legacy/a8.css 抽取规则到 modules/（a8 关闭时的主体样式）
 * 用法：node scripts/extract-a8-to-modules.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const a8Path = path.join(__dirname, "../public/copy/styles/legacy/a8.css");
const modulesDir = path.join(__dirname, "../public/copy/styles/modules");

/** 先匹配者优先 */
const BUCKETS = [
  {
    file: "tokens.css",
    match: (sel) => /^@font-face|^@keyframes|^@-webkit-keyframes|^:root/.test(sel),
  },
  {
    file: "sidebar-user.css",
    match: (sel) => /\.userinfo|\.userName|#app \.el-aside \.user/.test(sel),
  },
  {
    file: "sidebar-orders.css",
    match: (sel) =>
      (/\.orders|\.orderlink|\.order[^s]|\.loseorder|\.legend|\.dayProfit|\.orderDate/.test(sel) &&
        !/\.matchs|\.providers/.test(sel)) ||
      /\.orders /.test(sel),
  },
  {
    file: "account-bar.css",
    match: (sel) =>
      (/\.providers|\.account[^s]|\.account\.|\.account\s|\.provider-sort/.test(sel) && !/\.orders/.test(sel)),
  },
  {
    file: "platform-icons.css",
    match: (sel) => /\.provider-icon|\.am-icon-/.test(sel),
  },
  {
    file: "bet-row.css",
    match: (sel) =>
      (/\.bet-items|\.item-odds|\.bet[.\s{]|^\.bet$|\.defaultOdds|\.odds-|\.live\.|\.score|\.round/.test(sel) &&
        !/\.orders /.test(sel)) ||
      /\.bet\s/.test(sel),
  },
  {
    file: "match-list.css",
    match: (sel) => /\.matchs|\.match[^a-z]|\.match\.|\.match |\.game-|\.match-empty/.test(sel),
  },
  {
    file: "extension-banner.css",
    match: (sel) => /\.extension-banner|\.version/.test(sel),
  },
  {
    file: "dialogs.css",
    match: (sel) =>
      /\.el-dialog|\.el-overlay|\.el-form|\.el-tabs|\.el-message|\.user-diag|\.googlecode|\.el-popper|\.el-dropdown|\.el-message-box|\.el-select-dropdown/.test(
        sel,
      ),
  },
  {
    file: "element-table.css",
    match: (sel) => /\.el-table/.test(sel),
  },
  {
    file: "element-form.css",
    match: (sel) =>
      /\.el-checkbox|\.el-radio|\.el-switch|\.el-slider|\.el-upload|\.el-check-tag|\.el-transfer|\.el-form-item/.test(
        sel,
      ),
  },
  {
    file: "element-picker.css",
    match: (sel) =>
      /\.el-select|\.el-cascader|\.el-date|\.el-picker|\.el-time|\.el-month-table|\.el-year-table|\.time-select/.test(
        sel,
      ),
  },
  {
    file: "element-nav.css",
    match: (sel) => /\.el-step|\.el-menu|\.el-sub-menu|\.el-anchor|\.el-breadcrumb|\.el-page-header/.test(sel),
  },
  {
    file: "element-display.css",
    match: (sel) =>
      /\.el-tag|\.el-pagination|\.el-carousel|\.el-skeleton|\.el-timeline|\.el-descriptions|\.el-link|\.el-image|\.el-empty|\.el-result|\.el-statistic|\.el-avatar|\.el-badge|\.el-calendar|\.el-rate|\.el-progress/.test(
        sel,
      ),
  },
  {
    file: "element-overlay.css",
    match: (sel) =>
      /\.el-drawer|\.el-notification|\.el-tour|\.el-tooltip|\.el-loading|\.el-color-picker|\.el-popconfirm|\.el-affix|\.el-backtop|\.el-watermark/.test(
        sel,
      ),
  },
  /** 其余 EP 组件（须在 layout 之前，layout 仍保留 .el-container / .el-button 等布局类） */
  {
    file: "element-components.css",
    match: (sel) => /\.el-/.test(sel),
  },
  {
    file: "element-transitions.css",
    match: (sel) =>
      /\.fade-in|\.collapse-transition|\.v-modal|\.dialog-fade|\.viewer-fade|\.slideIn|\.carousel-arrow|\.horizontal-collapse|enter-active|leave-active|enter-from|leave-from|\[class\*=el-col-\]/.test(
        sel,
      ),
  },
  {
    file: "element-misc.css",
    match: (sel) =>
      /^fieldset|^p$|^p\{|^p |^p,|\.tip|\.container|\.currency|\.text-center|\.text-overflow|\.iconfont|\.login-|^\.loginbox|\.tags|\.report|\.pageSplit|\.parse|\.submit|\.moneyValue|\.hacked|\.Withdraw|\.rank|\.credit|\.top|\.message|\.wallets|\.date/.test(
        sel,
      ),
  },
  {
    file: "layout.css",
    match: (sel) =>
      /^(html|body|\*|#app|a,|aside|header|\.checking|random-|::-webkit|input\[type=number\])/.test(sel) ||
      /\.common-layout|\.home-view|\.flex|\.el-container|\.el-aside|\.el-main|\.el-header|\.el-footer|\.el-col-|\.el-row|\.el-button|\.el-input|\.match-search|\.app-sidebar|\.app-hint|\.pos|\.neg|@media/.test(
        sel,
      ),
  },
];

const REMAINDER = "a8-remainder.css";

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

function bucketFor(rule) {
  const sel = selectorOf(rule);
  for (const b of BUCKETS) {
    if (b.match(sel)) return b.file;
  }
  return REMAINDER;
}

function ensureIndexImports(out) {
  const indexPath = path.join(__dirname, "../public/copy/styles/index.css");
  let index = fs.readFileSync(indexPath, "utf8");

  const moduleImports = [
    "tokens.css",
    "layout.css",
    "sidebar-user.css",
    "sidebar-orders.css",
    "account-bar.css",
    "match-list.css",
    "bet-row.css",
    "extension-banner.css",
    "dialogs.css",
    "platform-icons.css",
    "element-table.css",
    "element-form.css",
    "element-picker.css",
    "element-nav.css",
    "element-display.css",
    "element-overlay.css",
    "element-components.css",
    "element-transitions.css",
    "element-misc.css",
    REMAINDER,
  ];

  const toAdd = moduleImports.filter((file) => out.get(file)?.length && !index.includes(`./modules/${file}`));
  if (toAdd.length) {
    const block = toAdd.map((file) => `@import url("./modules/${file}");`).join("\n");
    const anchor = '@import url("./modules/platform-icons.css");';
    if (!index.includes(anchor)) {
      index += `\n${block}\n`;
    } else {
      index = index.replace(anchor, `${anchor}\n${block}`);
    }
  }

  const remainderLine = `@import url("./modules/${REMAINDER}");`;
  if (!out.get(REMAINDER)?.length) {
    index = index.replace(new RegExp(`\\n?${remainderLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "g"), "\n");
  } else if (!index.includes(`./modules/${REMAINDER}`)) {
    const afterMisc = '@import url("./modules/element-misc.css");';
    if (index.includes(afterMisc)) {
      index = index.replace(afterMisc, `${afterMisc}\n${remainderLine}`);
    }
  }

  fs.writeFileSync(indexPath, index.trimEnd() + "\n");
}

function main() {
  if (!fs.existsSync(a8Path)) {
    console.error("[extract-a8-to-modules] missing", a8Path);
    console.error("Run: node public/copy/sync-styles.mjs");
    process.exit(1);
  }

  const css = fs.readFileSync(a8Path, "utf8");
  const rules = parseTopLevelRules(css.replace(/^@charset[^;]+;/, ""));
  const out = new Map(BUCKETS.map((b) => [b.file, []]));
  out.set(REMAINDER, []);

  for (const rule of rules) {
    out.get(bucketFor(rule)).push(rule);
  }

  fs.mkdirSync(modulesDir, { recursive: true });

  const header =
    "/* 由 scripts/extract-a8-to-modules.mjs 从 legacy/a8.css 抽取；a8 关时由 copyShell 加载 */\n\n";

  /** 按 legacy 原始顺序切段，供 /copy modules 皮肤逐段加载（层叠与 a8.css 一致） */
  const segDir = path.join(modulesDir, "segments");
  fs.rmSync(segDir, { recursive: true, force: true });
  fs.mkdirSync(segDir, { recursive: true });

  const manifestFiles = [];
  let segIndex = 0;
  let segBucket = null;
  let segRules = [];

  function flushSegment() {
    if (!segRules.length) return;
    const bucketSlug = segBucket.replace(/\.css$/, "");
    const name = `seg-${String(segIndex).padStart(3, "0")}-${bucketSlug}.css`;
    const href = `/copy/styles/modules/segments/${name}`;
    fs.writeFileSync(path.join(segDir, name), header + segRules.join(""));
    manifestFiles.push(href);
    segIndex += 1;
    segRules = [];
  }

  for (const rule of rules) {
    const bucket = bucketFor(rule);
    if (segBucket !== null && bucket !== segBucket) {
      flushSegment();
    }
    segBucket = bucket;
    segRules.push(rule);
  }
  flushSegment();

  fs.writeFileSync(
    path.join(segDir, "manifest.json"),
    `${JSON.stringify({ version: 1, ruleCount: rules.length, files: manifestFiles }, null, 2)}\n`,
  );
  console.log(`[extract-a8-to-modules] segments/: ${manifestFiles.length} files, ${rules.length} rules`);

  /** 兜底整包：manifest 缺失时 copyShell 回退 */
  const a8All = css.replace(/^@charset[^;]+;/, "").trim();
  fs.writeFileSync(
    path.join(modulesDir, "a8-all.css"),
    `${header}/* 与 legacy/a8.css 同序同内容，仅路径不同 */\n\n${a8All}\n`,
  );
  console.log("[extract-a8-to-modules] a8-all.css: full bundle (fallback)");

  for (const [file, chunks] of out) {
    if (!chunks.length) continue;
    fs.writeFileSync(path.join(modulesDir, file), header + chunks.join(""));
    console.log(`[extract-a8-to-modules] ${file}: ${chunks.length} rules`);
  }

  const remainderPath = path.join(modulesDir, REMAINDER);
  if (!out.get(REMAINDER)?.length && fs.existsSync(remainderPath)) {
    fs.unlinkSync(remainderPath);
  }

  ensureIndexImports(out);

  const remainderCount = out.get(REMAINDER)?.length ?? 0;
  console.log(`[extract-a8-to-modules] ${REMAINDER}: ${remainderCount} rules`);
  console.log("[extract-a8-to-modules] done");
}

main();
