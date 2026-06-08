"use strict";

const fs = require("fs");
const path = require("path");

/** 从任意 platform_adapter/backend 子目录向上查找 gamebet_backend 根 */
function findBackendRoot(startDir) {
  let cur = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(cur, "package.json");
    if (fs.existsSync(pkgPath) && fs.existsSync(path.join(cur, "core"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.name === "gamebet-backend") return cur;
      } catch {
        /* ignore */
      }
    }
    const sibling = path.join(cur, "gamebet_backend");
    const siblingPkg = path.join(sibling, "package.json");
    if (fs.existsSync(siblingPkg) && fs.existsSync(path.join(sibling, "core"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(siblingPkg, "utf8"));
        if (pkg.name === "gamebet-backend") return sibling;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`gamebet_backend root not found from ${startDir}`);
}

const BACKEND_ROOT = findBackendRoot(__dirname);
const BACKEND_NODE_MODULES = path.join(BACKEND_ROOT, "node_modules");

function reqB(...segments) {
  return require(path.join(BACKEND_ROOT, ...segments));
}

function backendRequire(specifier) {
  return require(require.resolve(specifier, { paths: [BACKEND_NODE_MODULES] }));
}

module.exports = {
  BACKEND_ROOT,
  BACKEND_NODE_MODULES,
  reqB,
  backendRequire,
};
