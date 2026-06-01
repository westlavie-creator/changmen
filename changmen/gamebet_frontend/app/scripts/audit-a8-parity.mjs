import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const frontendRoot = path.join(root, "..");
const bundleJs = fs.readFileSync(
  path.join(frontendRoot, "vendor/ui-bundle/index.js"),
  "utf8",
);
const indexCss = fs.readFileSync(
  path.join(frontendRoot, "../gamebet_backend/public/esport2/assets/index.css"),
  "utf8",
);
const a8Css = fs.readFileSync(path.join(root, "src/styles/a8.css"), "utf8");
const amIconCss = fs.readFileSync(path.join(root, "src/styles/a8-am-icon.css"), "utf8");
const fallbackCss = fs.readFileSync(path.join(root, "src/styles/a8-fallback.css"), "utf8");

const viewNames = [
  ...bundleJs.matchAll(/__name:\s*"([A-Z][A-Za-z]+View)"/g),
].map((m) => m[1]);
const appViews = [...new Set(viewNames)];

const appStart = bundleJs.indexOf('__name: "AccountInfoView"');
const appSection = bundleJs.slice(appStart);

const bundleClasses = new Set();
for (const m of appSection.matchAll(/class:\s*"([^"]+)"/g)) {
  bundleClasses.add(m[1]);
}

function walkVue(dir) {
  const classes = new Set();
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = walkVue(p);
      sub.classes.forEach((c) => classes.add(c));
      files.push(...sub.files);
    } else if (ent.name.endsWith(".vue")) {
      files.push(p);
      const t = fs.readFileSync(p, "utf8");
      for (const m of t.matchAll(/class="([^"]+)"/g)) {
        m[1].split(/\s+/).forEach((c) => c && classes.add(c));
      }
      for (const m of t.matchAll(/class:\s*'([^']+)'/g)) {
        classes.add(m[1]);
      }
    }
  }
  return { classes, files };
}

const { classes: vueClasses, files: vueFiles } = walkVue(path.join(root, "src"));

function extractSelectors(css) {
  const s = new Set();
  for (const m of css.matchAll(/\.([a-zA-Z_][\w-]*)/g)) s.add(m[1]);
  return s;
}

const indexNorm = indexCss.replace(/\[data-v-[a-f0-9]+\]/g, "");
const indexSelectors = extractSelectors(indexNorm);
const a8Selectors = extractSelectors(a8Css);

const cssOnlyInIndex = [...indexSelectors].filter((x) => !a8Selectors.has(x));
const cssOnlyInA8 = [...a8Selectors].filter((x) => !indexSelectors.has(x));

const skipClass = (c) =>
  c.startsWith("el-") ||
  c.startsWith("am-icon") ||
  c.startsWith("iconfont") ||
  c.includes("flex") ||
  c === "isAuto" ||
  c === "high" ||
  c === "lock" ||
  c === "target" ||
  c === "limit" ||
  c === "pause" ||
  c === "loading" ||
  c === "danger" ||
  c === "error" ||
  c === "active";

const bundleSemantic = [...bundleClasses].filter((c) => !skipClass(c)).sort();
const missingInVue = bundleSemantic.filter((c) => !vueClasses.has(c));

const vueMap = {
  AccountInfoView: "AccountEditDialog.vue",
  MoneyRiskView: "MoneyRiskView.vue",
  MoneyInfoView: "MoneyInfoDialog.vue",
  MoneyView: "MoneyLogDialog.vue",
  AccountView: "AccountBar.vue + AccountCard.vue",
  UserConfigView: "UserConfigDialog.vue",
  UserPasswordView: "UserDiagPasswordTab.vue",
  UserMessageView: "UserDiagMessageTab.vue",
  UserProxyView: "UserDiagProxyTab.vue",
  UserReportView: "UserDiagReportTab.vue",
  UserRankView: "UserDiagRankTab.vue",
  UserCollectView: "UserDiagCollectTab.vue + CollectConfigPanel.vue",
  TradeView: "UserDiagTradeTab.vue",
  FollowView: "UserDiagFollowTab.vue",
  UserChatMessageView: "UserDiagChatTab.vue",
  UserWalletView: "UserDiagWalletTab.vue",
  UserDiagView: "UserDiagDialog.vue",
  UserInfoView: "UserInfoPanel.vue",
  OrderView: "OrderView.vue",
  LoseOrderView: "LoseOrderView.vue",
  CreateLoseView: "CreateLoseDialog.vue",
  ExtensionsView: "ExtensionsBadge.vue",
  LimitDiagView: "LimitDiagDialog.vue",
  HomeView: "HomeView.vue + MatchCard + BetRow",
  LoginView: "LoginView.vue",
};

const unmappedViews = appViews.filter((v) => !vueMap[v]);

// scoped styles in vue that may override a8
const scopedOverrides = [];
for (const f of vueFiles) {
  const t = fs.readFileSync(f, "utf8");
  if (!t.includes("<style scoped")) continue;
  const rel = path.relative(path.join(root, "src"), f).replace(/\\/g, "/");
  const rules = [...t.matchAll(/<style scoped[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].trim());
  if (rules.length && rules.some((r) => r.length > 20)) {
    scopedOverrides.push({ file: rel, bytes: rules.join("").length });
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  sources: {
    bundleJs: "vendor/ui-bundle/index.js",
    indexCss: "gamebet_backend/public/esport2/assets/index.css",
    a8Css: "app/src/styles/a8.css (extract-a8-css.mjs)",
    a8AmIcon: "app/src/styles/a8-am-icon.css",
    a8Fallback: "app/src/styles/a8-fallback.css",
    appCss: "app/src/styles/app.css",
    userDiagCss: "app/src/styles/user-diag.css",
  },
  css: {
    indexCssBytes: indexCss.length,
    a8CssBytes: a8Css.length,
    amIconCssBytes: amIconCss.length,
    fallbackCssBytes: fallbackCss.length,
    indexSelectorCount: indexSelectors.size,
    a8SelectorCount: a8Selectors.size,
    selectorOnlyInIndexCount: cssOnlyInIndex.length,
    selectorOnlyInA8Count: cssOnlyInA8.length,
    selectorOnlyInIndex: cssOnlyInIndex.sort(),
    selectorOnlyInA8: cssOnlyInA8.sort(),
  },
  bundleAppViews: appViews,
  vueMap,
  unmappedViews,
  bundleSemanticClassesMissingInVue: missingInVue,
  vueScopedStyleFiles: scopedOverrides.sort((a, b) => b.bytes - a.bytes),
};

const outPath = path.join(root, "docs/A8_PARITY_AUDIT_MACHINE.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("Wrote", outPath);
console.log("bundle views:", appViews.length);
console.log("css selector diff:", cssOnlyInIndex.length, cssOnlyInA8.length);
console.log("bundle classes missing in vue:", missingInVue.length);
