#!/usr/bin/env node
/**
 * 扫描 client/web 内 @changmen/venue-adapter/* 引用，供 package.json exports 与 PATH_REGISTRY 核对。
 * 用法：node client/venue-adapter/scripts/list-web-venue-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(__dirname, "../../web/src");
const PKG = "@changmen/venue-adapter";

const IMPORT_RE = new RegExp(
  `(?:from|import)\\s*(?:\\(?\\s*)?["']${PKG}/([^"']+)["']`,
  "g",
);
const DYNAMIC_RE = new RegExp(
  `import\\s*\\(\\s*["']${PKG}/([^"']+)["']\\s*\\)`,
  "g",
);
const MOCK_RE = new RegExp(
  `vi\\.mock\\s*\\(\\s*["']${PKG}/([^"']+)["']`,
  "g",
);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory())
      walk(p, out);
    else if (/\.(ts|vue|tsx)$/.test(name))
      out.push(p);
  }
  return out;
}

const subs = new Set();
for (const file of walk(WEB_SRC)) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of [IMPORT_RE, DYNAMIC_RE, MOCK_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      subs.add(m[1]);
    }
  }
}

const sorted = [...subs].sort();
const roots = new Set(sorted.map((s) => s.split("/")[0]));
console.log(`${PKG} subpaths from client/web/src (${sorted.length}, ${roots.size} top-level):`);
for (const sub of sorted) {
  console.log(`  ./${sub}`);
}
