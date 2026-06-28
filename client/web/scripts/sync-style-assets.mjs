/**
 * 将 src/styles 同步到 public/assets/styles/changmen/。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.join(__dirname, "../src/styles");
const changmenDir = path.join(__dirname, "../public/assets/styles/changmen");

/** src/styles -> assets/styles/changmen/（生产皮肤用，进 git；顺序与 main.ts 一致） */
export const CHANGMEN_STYLE_MAP = [
  ["ep-chalk.css", "ep-chalk.css"],
  ["login-carousel.css", "login-carousel.css"],
  ["tokens.css", "tokens.css"],
  ["layout.css", "layout.css"],
  ["misc.css", "misc.css"],
  ["ep-fallback.css", "ep-fallback.css"],
  ["am-icon.css", "am-icon.css"],
  ["platform-icons.css", "platform-icons.css"],
  ["icon-fallback.css", "icon-fallback.css"],
  ["user-diag.css", "user-diag.css"],
  ["app.css", "app.css"],
  ["account-bar.css", "account-bar.css"],
  ["match-list.css", "match-list.css"],
  ["bet-row.css", "bet-row.css"],
  ["sidebar-user.css", "sidebar-user.css"],
  ["extension-banner.css", "extension-banner.css"],
  ["admin-theme.css", "admin-theme.css"],
  ["sidebar-orders.css", "sidebar-orders.css"],
];

/**
 * 将 src/styles 补丁层同步到 assets/styles/changmen/
 * @param {{ files?: [string, string][], stylesDir?: string, outDir?: string }} [options]
 */
export function syncChangmenStyles(options = {}) {
  const fromDir = options.stylesDir ?? stylesDir;
  const toDir = options.outDir ?? changmenDir;
  const files = options.files ?? CHANGMEN_STYLE_MAP;

  fs.mkdirSync(toDir, { recursive: true });

  let copied = 0;
  const missing = [];
  for (const [srcName, outName] of files) {
    const src = path.join(fromDir, srcName);
    if (!fs.existsSync(src)) {
      console.warn(`[sync-style-assets] skip missing ${srcName}`);
      missing.push(srcName);
      continue;
    }
    fs.copyFileSync(src, path.join(toDir, outName));
    copied += 1;
  }

  console.log(`[sync-style-assets] copied ${copied} file(s) -> public/assets/styles/changmen/`);
  return { copied, missing };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  syncChangmenStyles();
}
