/**
 * 盘点 Vue 中实际使用的 Element Plus 组件 vs extract element-* 分桶。
 * 用法：node scripts/audit-element-buckets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const modulesDir = path.join(webRoot, "public/copy/styles/modules");
const srcDir = path.join(webRoot, "src");

/** 与 extract-a8-to-modules.mjs 分桶一致 */
const BUCKET_FILES = [
  "dialogs.css",
  "element-table.css",
  "element-form.css",
  "element-picker.css",
  "element-nav.css",
  "element-display.css",
  "element-overlay.css",
  "element-components.css",
  "element-transitions.css",
  "element-misc.css",
];

/** 分桶 → 主要覆盖的 EP 组件前缀（用于粗粒度对账） */
const BUCKET_COMPONENTS = {
  "dialogs.css":
    "dialog, overlay, form, tabs, message, message-box, popper, dropdown, select-dropdown, user-diag",
  "element-table.css": "table, scrollbar(表格内)",
  "element-form.css": "checkbox, radio, switch, slider, upload, check-tag, transfer, form-item",
  "element-picker.css": "select, cascader, date-*, picker, time-*, month-table, year-table",
  "element-nav.css": "step, menu, sub-menu, anchor, breadcrumb, page-header",
  "element-display.css":
    "tag, pagination, carousel, skeleton, timeline, descriptions, link, image, empty, result, statistic, avatar, badge, calendar, rate, progress",
  "element-overlay.css":
    "drawer, notification, tour, tooltip, loading, color-picker, popconfirm, affix, backtop, watermark",
  "element-components.css": "其余 .el-*（button, input, col, row, divider, autocomplete, alert, text…）",
  "element-transitions.css": "fade, v-modal, dialog-fade, collapse-transition, el-col-* grid",
  "element-misc.css": "fieldset, currency, tip, loginbox…（非 EP）",
};

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

function collectUsage() {
  const tagCounts = new Map();
  const apiCounts = new Map();
  const tagRe = /<el-([a-z0-9-]+)/gi;
  const apiRe = /\bEl([A-Z][a-zA-Z]+)\b/g;
  for (const file of walk(srcDir)) {
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = tagRe.exec(text))) {
      tagCounts.set(m[1], (tagCounts.get(m[1]) ?? 0) + 1);
    }
    while ((m = apiRe.exec(text))) {
      if (m[1] === "ElementPlus" || m[1] === "Element") continue;
      apiCounts.set(m[1], (apiCounts.get(m[1]) ?? 0) + 1);
    }
  }
  return { tagCounts, apiCounts };
}

function extractElClasses(css) {
  const map = new Map();
  for (const m of css.matchAll(/\.(el-[a-z0-9-]+)/g)) {
    map.set(m[1], (map.get(m[1]) ?? 0) + 1);
  }
  return map;
}

function prefixOf(elClass) {
  const base = elClass.replace(/^el-/, "").split(/[-_]/)[0];
  return `el-${base}`;
}

function buildUsedPrefixes(tagCounts, apiCounts) {
  const used = new Set();
  for (const tag of tagCounts.keys()) {
    used.add(`el-${tag}`);
  }
  const apiToTag = {
    Message: "message",
    MessageBox: "message-box",
    Notification: "notification",
    Loading: "loading",
  };
  for (const [api, tag] of Object.entries(apiToTag)) {
    if (apiCounts.has(api)) used.add(`el-${tag}`);
  }
  used.add("el-popper");
  used.add("el-overlay");
  used.add("el-select-dropdown");
  used.add("el-scrollbar");
  used.add("el-icon");
  return used;
}

function bucketTouchesUsed(elClasses, usedPrefixes) {
  for (const cls of elClasses.keys()) {
    const p = prefixOf(cls);
    for (const u of usedPrefixes) {
      if (cls === u || cls.startsWith(`${u}-`) || cls.startsWith(`${u}__`) || p === u) {
        return true;
      }
    }
  }
  return false;
}

function main() {
  const { tagCounts, apiCounts } = collectUsage();
  const usedPrefixes = buildUsedPrefixes(tagCounts, apiCounts);

  console.log("[audit-element] 模板 <el-*> 使用次数（降序）");
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  el-${tag}`);
  }
  console.log("\n[audit-element] 编程式 API");
  for (const [api, n] of [...apiCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  El${api}`);
  }

  console.log("\n[audit-element] 分桶对账（先跑 extract-a8-to-modules.mjs）");
  let totalBytes = 0;
  let totalRules = 0;
  for (const file of BUCKET_FILES) {
    const p = path.join(modulesDir, file);
    if (!fs.existsSync(p)) {
      console.log(`  ${file.padEnd(26)} MISSING (已 skip 或未 extract)`);
      continue;
    }
    const css = fs.readFileSync(p, "utf8");
    const rules = (css.match(/\{/g) ?? []).length;
    const bytes = fs.statSync(p).size;
    totalBytes += bytes;
    totalRules += rules;
    const elClasses = extractElClasses(css);
    const touched = bucketTouchesUsed(elClasses, usedPrefixes);
    const verdict = touched ? "保留" : "可删桶";
    console.log(
      `  ${verdict}  ${file.padEnd(26)} ${String(bytes).padStart(6)} B  ${String(rules).padStart(3)} rules  ${elClasses.size} el-classes`,
    );
    console.log(`         覆盖: ${BUCKET_COMPONENTS[file] ?? "?"}`);
  }
  console.log(`\n[audit-element] element-* + dialogs 合计: ${totalRules} rules, ${totalBytes} bytes`);
  console.log(
    "[audit-element] 说明: element-transitions / element-misc 虽无 .el- 类名，仍含 dialog 动画、fieldset/currency，不可删桶。",
  );
  console.log("[audit-element] 仅 element-nav 已确认零使用，extract 已 skip。");
  console.log(
    "[audit-element] P2 桶内裁剪（extract skip）: display/form/picker/overlay/dialogs/components 未使用 EP 族 + carousel 过渡",
  );
  console.log("[audit-element] 阶段 D 续裁候选: npm run audit:p2-candidates");
}

main();
