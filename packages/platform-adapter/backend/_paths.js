import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** 从任意 platform_adapter/backend 子目录向上查找 apps/backend 根 */
function findBackendRoot(startDir) {
  let cur = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(cur, "package.json");
    if (fs.existsSync(pkgPath) && fs.existsSync(path.join(cur, "core"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.name === "@changmen/backend") return cur;
      } catch {
        /* ignore */
      }
    }
    const sibling = path.join(cur, "apps", "backend");
    const siblingPkg = path.join(sibling, "package.json");
    if (fs.existsSync(siblingPkg) && fs.existsSync(path.join(sibling, "core"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(siblingPkg, "utf8"));
        if (pkg.name === "@changmen/backend") return sibling;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`apps/backend root not found from ${startDir}`);
}

export const BACKEND_ROOT = findBackendRoot(__dirname);
export const SHARED_ROOT = path.join(BACKEND_ROOT, "..", "..", "packages", "shared");
export const BACKEND_NODE_MODULES = path.join(BACKEND_ROOT, "node_modules");

export function reqB(...segments) {
  return require(path.join(BACKEND_ROOT, ...segments));
}

/** changmen/packages/shared — 通过 workspace 包 @changmen/shared 解析 */
export function reqS(...segments) {
  const entry = `@changmen/shared/${segments.join("/")}`;
  return require(require.resolve(entry, { paths: [BACKEND_NODE_MODULES] }));
}

export function backendRequire(specifier) {
  return require(require.resolve(specifier, { paths: [BACKEND_NODE_MODULES] }));
}
