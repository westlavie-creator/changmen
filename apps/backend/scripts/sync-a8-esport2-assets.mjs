#!/usr/bin/env node
/**
 * 从 A8 官方 esport2 静态资源同步缺失文件到 public/esport2/assets/。
 * 资源列表来自 A8 index.css（与 bundle 使用的同源 CDN）。
 *
 *   node scripts/sync-a8-esport2-assets.mjs
 *   node scripts/sync-a8-esport2-assets.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "..");
const ASSETS_DIR = path.join(BACKEND_ROOT, "public/esport2/assets");
const A8_CSS_URL = "https://api.a8.to/esport2/assets/index.css";
const A8_BASE = "https://api.a8.to/esport2/assets/";
/** A8 CDN 已下线；与 a8-am-icon.css 注释一致，使用 FA 4.7 官方字体 */
const FONTAWESOME_WOFF2 =
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2";

const dryRun = process.argv.includes("--dry-run");

function collectUrlsFromCss(css, prefix = "/esport2/assets/") {
  const names = new Set();
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) {
    let u = m[1].replace(/^['"]|['"]$/g, "").trim();
    if (u.startsWith("data:")) continue;
    if (u.startsWith("./")) u = u.slice(2);
    if (u.startsWith(prefix)) u = u.slice(prefix.length);
    if (/^[A-Za-z0-9_.-]+$/.test(u)) names.add(u);
  }
  return names;
}

function mergeLocalRefs() {
  const names = new Set();
  const a8CssPath = path.join(
    BACKEND_ROOT,
    "../web/src/styles/a8.css",
  );
  const amIconPath = path.join(
    BACKEND_ROOT,
    "../web/src/styles/a8-am-icon.css",
  );
  if (fs.existsSync(a8CssPath)) {
    for (const n of collectUrlsFromCss(fs.readFileSync(a8CssPath, "utf8"))) names.add(n);
  }
  if (fs.existsSync(amIconPath)) {
    for (const n of collectUrlsFromCss(fs.readFileSync(amIconPath, "utf8"))) names.add(n);
  }
  return names;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function fetchBinary(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  console.log(`[sync-a8-esport2] 拉取 ${A8_CSS_URL}`);
  const indexCss = await fetchText(A8_CSS_URL);
  const fromA8 = collectUrlsFromCss(indexCss, "./");
  const fromLocal = mergeLocalRefs();
  const all = new Set([...fromA8, ...fromLocal, "version.json"]);

  const existing = new Set(
    fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR) : [],
  );
  const todo = [...all].filter((n) => n !== "index.css" && !existing.has(n)).sort();

  console.log(`[sync-a8-esport2] A8 CSS 引用 ${fromA8.size} 个，本地 CSS 补充后共 ${all.size} 个`);
  console.log(`[sync-a8-esport2] 磁盘已有 ${existing.size} 个，待下载 ${todo.length} 个`);

  if (dryRun) {
    for (const n of todo) console.log("  would fetch", n);
    return;
  }

  // 始终更新 index.css（A8 源）供 extract-a8-css 使用
  fs.writeFileSync(path.join(ASSETS_DIR, "index.css"), indexCss);
  console.log("[sync-a8-esport2] 已写入 index.css");

  const esport2Dir = path.join(BACKEND_ROOT, "public/esport2");
  fs.mkdirSync(esport2Dir, { recursive: true });
  try {
    const rootVersion = await fetchBinary("https://api.a8.to/esport2/version.json");
    fs.writeFileSync(path.join(esport2Dir, "version.json"), rootVersion);
    console.log("[sync-a8-esport2] 已写入 esport2/version.json");
  } catch (err) {
    console.warn("[sync-a8-esport2] esport2/version.json 跳过:", err.message);
  }

  let ok = 0;
  let fail = 0;
  for (const name of todo) {
    const url = name === "fontawesome-webfont.woff2" ? FONTAWESOME_WOFF2 : A8_BASE + name;
    try {
      const data = await fetchBinary(url);
      fs.writeFileSync(path.join(ASSETS_DIR, name), data);
      const src = name === "fontawesome-webfont.woff2" ? "cdnjs FA4.7" : "A8 CDN";
      console.log(`  OK ${name} (${data.length} bytes, ${src})`);
      ok++;
    } catch (err) {
      console.error(`  FAIL ${name}: ${err.message}`);
      fail++;
    }
  }

  console.log(`[sync-a8-esport2] 完成：成功 ${ok}，失败 ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[sync-a8-esport2]", err);
  process.exit(1);
});
