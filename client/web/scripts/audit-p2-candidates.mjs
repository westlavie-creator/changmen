/**
 * 阶段 D：对比 Vue 用量 vs extract 保留的 EP 组件族，列出可加入 P2 skip 的 slug。
 * 用法：node scripts/audit-p2-candidates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bucketFor, parseTopLevelRules, selectorOf } from "./extract-a8-to-modules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const srcDir = path.join(webRoot, "src");
const a8AllPath = path.join(webRoot, "public/copy/styles/modules/a8-all.css");

/** 与 extract P2_UNUSED_EP_BY_BUCKET 同步（粗粒度对账用） */
const P2_SKIP = new Set([
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
  "tree",
  "mention",
  "vl",
  "segmented",
  "card",
  "space",
  "collapse",
  "color-predefine",
  "checkbox-button",
  "input-number",
  "textarea",
  "footer",
  "table-v2",
  "list",
  "spinner",
  "color",
  "vg",
  "virtual",
]);

/** slug 为粗分词，以下在 extract 中仍保留（date-picker / pagination / popper 内部） */
const P2_FALSE_POSITIVE_SLUGS = new Set([
  "range",
  "month",
  "year",
  "pager",
  "zoom",
  "fade",
  "popup",
  "transitioning",
  "opacity",
]);

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walk(p, acc);
    } else if (/\.(vue|ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function collectUsedSlugs() {
  const used = new Set();
  const tagRe = /<el-([a-z0-9-]+)/gi;
  for (const file of walk(srcDir)) {
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = tagRe.exec(text))) {
      used.add(m[1].split("-")[0]);
    }
  }
  for (const slug of [
    "message", "notification", "loading", "popper", "overlay", "dropdown", "scrollbar", "icon",
    "form", "form-item", "tab", "picker", "date", "time", "input", "button", "col", "row",
  ]) {
    used.add(slug);
  }
  return used;
}

function slugFromClass(elClass) {
  return elClass.replace(/^el-/, "").split(/[-_]/)[0];
}

function epSlugInSelector(sel, slug) {
  const esc = slug.replace(/-/g, "\\-");
  return new RegExp(`\\.el-${esc}(\\b|--|__|[\\s#.\\[:])`).test(sel);
}

const used = collectUsedSlugs();
const css = fs.readFileSync(a8AllPath, "utf8").replace(/^\/\*[\s\S]*?\*\//, "");
const rules = parseTopLevelRules(css);

const bySlug = new Map();
for (const rule of rules) {
  const bucket = bucketFor(rule);
  const sel = selectorOf(rule);
  const slugs = new Set();
  for (const m of sel.matchAll(/\.(el-[a-z0-9-]+)/g)) {
    slugs.add(slugFromClass(m[1]));
  }
  for (const slug of slugs) {
    if (!bySlug.has(slug)) bySlug.set(slug, { rules: 0, buckets: new Set() });
    const row = bySlug.get(slug);
    row.rules += 1;
    row.buckets.add(bucket);
  }
}

const candidates = [];
for (const [slug, { rules: n, buckets }] of [...bySlug.entries()].sort((a, b) => b[1].rules - a[1].rules)) {
  if (P2_SKIP.has(slug)) continue;
  if (used.has(slug)) continue;
  candidates.push({ slug, rules: n, buckets: [...buckets] });
}

console.log("[audit-p2] 已 skip slug 数:", P2_SKIP.size);
console.log("[audit-p2] extract 保留且模板/API 未用的 EP 族（候选 P2 扩展）:\n");
if (!candidates.length) {
  console.log("  (无 — P2 已裁干净，或仅剩编程式/内部依赖)");
} else {
  for (const { slug, rules, buckets } of candidates) {
    const note = P2_FALSE_POSITIVE_SLUGS.has(slug) ? "  ← 保留（内部依赖，勿 skip）" : "";
    console.log(`  ${slug.padEnd(16)} ${String(rules).padStart(4)} rules  ${buckets.join(", ")}${note}`);
  }
}

/** 抽样：候选 slug 在 extract 保留规则中的首条 */
for (const { slug } of candidates.filter((c) => !P2_FALSE_POSITIVE_SLUGS.has(c.slug)).slice(0, 4)) {
  const hit = rules.find((r) => epSlugInSelector(selectorOf(r), slug));
  if (hit) console.log(`\n  sample .el-${slug}: ${selectorOf(hit).slice(0, 100)}`);
}
