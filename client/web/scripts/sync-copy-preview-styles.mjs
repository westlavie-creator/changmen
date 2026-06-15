/**
 * 将 src/styles 同步到 public/copy/styles/legacy/（过渡期对照层）。
 * changmen 自有样式在 public/copy/styles/modules/ + index.css。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.join(__dirname, "../src/styles");
const legacyDir = path.join(__dirname, "../public/copy/styles/legacy");

/** 与 main.ts 引入顺序一致 */
export const COPY_LEGACY_FILES = [
  "a8.css",
  "login-carousel.css",
  "a8-fallback.css",
  "a8-am-icon.css",
  "a8-icon-fallback.css",
  "user-diag.css",
  "app.css",
  "admin-theme.css",
];

/** src/styles → modules/changmen/（/copy modules 皮肤用，进 git；顺序与 main.ts 一致） */
export const CHANGMEN_MODULE_MAP = [
  ["login-carousel.css", "login-carousel.css"],
  ["a8-fallback.css", "ep-fallback.css"],
  ["a8-am-icon.css", "am-icon.css"],
  ["a8-icon-fallback.css", "icon-fallback.css"],
  ["user-diag.css", "user-diag.css"],
  ["app.css", "app.css"],
  ["admin-theme.css", "admin-theme.css"],
];

/** @deprecated 使用 COPY_LEGACY_FILES */
export const COPY_STYLE_FILES = COPY_LEGACY_FILES;

/**
 * @param {{ files?: string[], stylesDir?: string, outDir?: string }} [options]
 * @returns {{ copied: number, missing: string[] }}
 */
export function syncCopyPreviewStyles(options = {}) {
  const fromDir = options.stylesDir ?? stylesDir;
  const toDir = options.outDir ?? legacyDir;
  const files = options.files ?? COPY_LEGACY_FILES;

  fs.mkdirSync(toDir, { recursive: true });

  let copied = 0;
  const missing = [];
  for (const name of files) {
    const src = path.join(fromDir, name);
    if (!fs.existsSync(src)) {
      console.warn(`[sync-copy-preview-styles] skip missing ${name}`);
      missing.push(name);
      continue;
    }
    fs.copyFileSync(src, path.join(toDir, name));
    copied += 1;
  }

  console.log(`[sync-copy-preview-styles] copied ${copied} file(s) -> public/copy/styles/legacy/`);
  return { copied, missing };
}

/**
 * 将 src/styles 补丁层同步到 modules/changmen/（仅 /copy modules 路径，不动正式 /）
 * @param {{ files?: [string, string][], stylesDir?: string, outDir?: string }} [options]
 */
export function syncChangmenModuleStyles(options = {}) {
  const fromDir = options.stylesDir ?? stylesDir;
  const toDir = options.outDir ?? path.join(legacyDir, "../modules/changmen");
  const files = options.files ?? CHANGMEN_MODULE_MAP;

  fs.mkdirSync(toDir, { recursive: true });

  let copied = 0;
  const missing = [];
  for (const [srcName, outName] of files) {
    const src = path.join(fromDir, srcName);
    if (!fs.existsSync(src)) {
      console.warn(`[sync-changmen-modules] skip missing ${srcName}`);
      missing.push(srcName);
      continue;
    }
    fs.copyFileSync(src, path.join(toDir, outName));
    copied += 1;
  }

  console.log(`[sync-changmen-modules] copied ${copied} file(s) -> public/copy/styles/modules/changmen/`);
  return { copied, missing };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  syncCopyPreviewStyles();
  syncChangmenModuleStyles();
}
