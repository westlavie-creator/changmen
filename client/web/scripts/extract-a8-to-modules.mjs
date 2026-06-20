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
    match: (sel) => /\.am-icon-|\.game-container.*am-icon/.test(sel),
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
      /\.el-dialog|\.el-overlay|\.el-form(?!-item)|\.el-tabs|\.el-message|\.user-diag|\.googlecode|\.el-popper|\.el-dropdown|\.el-message-box|\.el-select-dropdown/.test(
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

/** 平台角标背景图由 platform-icons.css 维护；上下文尺寸/定位仍留在 extract 分桶 */
function isChangmenPlatformIconRule(rule) {
  const sel = selectorOf(rule).trim();
  return /^\.provider-icon(\.[A-Za-z0-9]+)?$/.test(sel);
}

/** 侧栏 / 角标等由 changmen sidebar-*.css、extension-banner.css 维护 */
const CHANGMEN_OWNED_BUCKETS = new Set([
  "sidebar-user.css",
  "sidebar-orders.css",
  "extension-banner.css",
  "account-bar.css",
  "match-list.css",
  "bet-row.css",
  "layout.css",
  "element-misc.css",
]);

/** 盘点后确认零使用的 EP 分桶（audit-element-buckets.mjs） */
const SKIPPED_ELEMENT_BUCKETS = new Set(["element-nav.css"]);

/**
 * P2 桶内裁剪：模板零使用的 EP 组件族（仅 skip extract 规则，legacy 仍保留整包 a8.css）
 * 维护：npm run audit:element-buckets && npm run audit:p2-candidates
 */
/** 阶段 D：audit-p2-candidates 确认零 <el-*> 用量（datetime date-picker 仍保留 time/month/year） */
const P2D_ZERO_USAGE_SLUGS = [
  "segmented",
  "card",
  "space",
  "collapse",
  "tree",
  "color-predefine",
  "checkbox-button",
  "input-number",
  "textarea",
  "footer",
];

/** 阶段 D 小步：audit-p2-candidates 二次确认（勿 skip popup/range/pager/zoom/fade） */
const P2E_MICRO_SLUGS = ["table-v2", "list", "spinner", "color", "vg", "virtual"];

const P2_UNUSED_EP_BY_BUCKET = {
  "element-display.css": [
    "carousel",
    "avatar",
    "badge",
    "calendar",
    "descriptions",
    "image",
    "rate",
    "result",
    "skeleton",
    "timeline",
  ],
  "element-form.css": [
    "slider",
    "upload",
    "transfer",
    "check-tag",
    "cascader",
    "checkbox-button",
    "textarea",
    "tree",
  ],
  "element-picker.css": ["cascader"],
  "element-table.css": ["table-v2", "virtual"],
  "element-overlay.css": ["tour", "color-picker", "popconfirm", "affix", "backtop", "watermark"],
  "dialogs.css": [
    "color-picker",
    "popover",
    "tree-select",
    "tree-node",
    "tree",
    "mention",
    "cascader",
    "vl",
  ],
  "element-components.css": [
    "carousel",
    "avatar",
    "badge",
    "calendar",
    "descriptions",
    "image",
    "rate",
    "result",
    "skeleton",
    "timeline",
    "slider",
    "upload",
    "transfer",
    "check-tag",
    "cascader",
    "tour",
    "color-picker",
    "popconfirm",
    "affix",
    "backtop",
    "watermark",
    "popover",
    "tree-select",
    "tree-node",
    "mention",
    "vl",
    ...P2D_ZERO_USAGE_SLUGS,
    ...P2E_MICRO_SLUGS,
  ],
};

function epSlugInSelector(sel, slug) {
  const esc = slug.replace(/-/g, "\\-");
  return new RegExp(`\\.el-${esc}(\\b|--|__|[\\s#.\\[:])`).test(sel);
}

/** 规则任一选择器片段命中该桶 P2 未使用组件 → 不进入 modules extract */
function isSkippedUnusedEpRule(rule) {
  const bucket = bucketFor(rule);
  const slugs = P2_UNUSED_EP_BY_BUCKET[bucket];
  if (!slugs?.length) return false;
  const sel = selectorOf(rule);
  return sel.split(",").some((part) => slugs.some((slug) => epSlugInSelector(part.trim(), slug)));
}

/** carousel 已裁剪，过渡桶里的 carousel-arrow 一并丢弃 */
function isSkippedCarouselTransitionRule(rule) {
  if (bucketFor(rule) !== "element-transitions.css") return false;
  return /\.carousel-arrow/.test(selectorOf(rule));
}

function isChangmenOwnedModuleRule(rule) {
  const bucket = bucketFor(rule);
  if (CHANGMEN_OWNED_BUCKETS.has(bucket)) {
    // layout 分桶：仅 @media el-col 栅格留 extract；其余由 changmen/layout.css 维护
    if (bucket === "layout.css") {
      return !/^@media/.test(selectorOf(rule).trim());
    }
    return true;
  }
  return SKIPPED_ELEMENT_BUCKETS.has(bucket);
}

/** #app / .common-layout 壳层由 changmen/layout.css 维护 */
function isChangmenAppShellExtractSkip(rule) {
  if (bucketFor(rule) !== "element-components.css") return false;
  const sel = selectorOf(rule).trim();
  if (/^#app\s*,/.test(sel) || /^#app \.el-aside/.test(sel)) return true;
  return /^(?:\.el-container(?:\.is-vertical)?|\.el-header|\.el-main)$/.test(sel);
}

/** tokens 分桶：changmen 字体/业务动画；:root 内 --el-* 由 changmen/ep-vars.css（EP 官方）提供 */
function isChangmenTokensRule(rule) {
  const sel = selectorOf(rule).trim();
  if (/^@font-face/.test(sel) && /font-family:asus/.test(rule)) return true;
  if (/^@keyframes (balance-danger-80afd9d4|account-active-80afd9d4|background-animation)\b/.test(sel)) {
    return true;
  }
  return false;
}

/** tokens 分桶内 EP :root 变量（--el-*）不再从 A8 extract 复制 */
function isEpRootTokensExtractSkip(rule) {
  if (bucketFor(rule) !== "tokens.css") return false;
  const sel = selectorOf(rule).trim();
  if (!/^:root\b/.test(sel)) return false;
  return /--el-/.test(rule);
}

/**
 * 阶段 C：dialogs 分桶 partial skip
 * - `.el-tabs--top { column-reverse }` 由 changmen/ep-fallback.css 覆盖为 column
 * - left/right/bottom tabs 模板零使用（UserDiag 仅 border-card）
 * - `.user-diag-*` / `.googlecode` 由 changmen/user-diag.css 维护（A8 无对应规则，前缀 skip 作兜底）
 */
function isChangmenDialogsExtractSkip(rule) {
  if (bucketFor(rule) !== "dialogs.css") return false;
  const sel = selectorOf(rule);
  if (/^\.el-tabs--top\b/.test(sel.trim()) && /column-reverse/.test(rule)) return true;
  if (/\.el-tabs--(?:left|right|bottom)\b/.test(sel)) return true;
  if (/\.(?:user-diag|googlecode)\b/.test(sel)) return true;
  return false;
}

function shouldSkipExtractRule(rule) {
  return (
    isChangmenPlatformIconRule(rule) ||
    isChangmenOwnedModuleRule(rule) ||
    isChangmenTokensRule(rule) ||
    isEpRootTokensExtractSkip(rule) ||
    isSkippedUnusedEpRule(rule) ||
    isSkippedCarouselTransitionRule(rule) ||
    isChangmenAppShellExtractSkip(rule) ||
    isChangmenDialogsExtractSkip(rule)
  );
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
  const toRemove = moduleImports.filter((file) => !out.get(file)?.length && index.includes(`./modules/${file}`));
  for (const file of toRemove) {
    index = index.replace(new RegExp(`@import url\\(\"\\./modules/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\"\\);\\n?`, "g"), "");
  }
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
  let p2SkipCount = 0;
  let p2TransitionSkipCount = 0;
  let epRootSkipCount = 0;
  let dialogsPartialSkipCount = 0;
  for (const rule of rules) {
    if (isSkippedUnusedEpRule(rule)) p2SkipCount += 1;
    if (isSkippedCarouselTransitionRule(rule)) p2TransitionSkipCount += 1;
    if (isEpRootTokensExtractSkip(rule)) epRootSkipCount += 1;
    if (isChangmenDialogsExtractSkip(rule)) dialogsPartialSkipCount += 1;
  }
  const keptRules = rules.filter((rule) => !shouldSkipExtractRule(rule));
  const out = new Map(BUCKETS.map((b) => [b.file, []]));
  out.set(REMAINDER, []);

  for (const rule of keptRules) {
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

  for (const rule of keptRules) {
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
    `${JSON.stringify({ version: 1, ruleCount: keptRules.length, files: manifestFiles }, null, 2)}\n`,
  );
  console.log(`[extract-a8-to-modules] segments/: ${manifestFiles.length} files, ${keptRules.length} rules`);
  console.log(`[extract-a8-to-modules] EP :root skip: ${epRootSkipCount} rules`);
  console.log(`[extract-a8-to-modules] P2 unused EP skip: ${p2SkipCount} rules`);
  if (dialogsPartialSkipCount) {
    console.log(`[extract-a8-to-modules] C dialogs partial skip: ${dialogsPartialSkipCount} rules`);
  }
  if (p2TransitionSkipCount) {
    console.log(`[extract-a8-to-modules] P2 carousel-transition skip: ${p2TransitionSkipCount} rules`);
  }

  /** 兜底整包：与 segments 同序同过滤（非 legacy 原文） */
  const a8All = keptRules.join("");
  fs.writeFileSync(
    path.join(modulesDir, "a8-all.css"),
    `${header}/* filtered extract（与 segments 一致）；EP :root 见 changmen/ep-vars.css */\n\n${a8All}\n`,
  );
  console.log("[extract-a8-to-modules] a8-all.css: filtered bundle (fallback)");

  for (const [file, chunks] of out) {
    const bucketPath = path.join(modulesDir, file);
    if (!chunks.length) {
      if (fs.existsSync(bucketPath)) fs.unlinkSync(bucketPath);
      continue;
    }
    fs.writeFileSync(bucketPath, header + chunks.join(""));
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

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

export { parseTopLevelRules, selectorOf, bucketFor, isChangmenDialogsExtractSkip };
