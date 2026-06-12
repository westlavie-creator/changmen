"use strict";

/**
 * CJS 过渡桥：各平台 backend/_require.js 在 C1 前仍 require 本文件。
 * 逻辑与 _paths.js 保持一致；C1 起各平台改直接 import _paths.js 后可删除。
 */
const fs = require("fs");
const path = require("path");

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
const SHARED_ROOT = path.join(path.dirname(BACKEND_ROOT), "shared");
const BACKEND_NODE_MODULES = path.join(BACKEND_ROOT, "node_modules");

function reqB(...segments) {
  return require(path.join(BACKEND_ROOT, ...segments));
}

function reqS(...segments) {
  return require(path.join(SHARED_ROOT, ...segments));
}

function backendRequire(specifier) {
  return require(require.resolve(specifier, { paths: [BACKEND_NODE_MODULES] }));
}

module.exports = {
  BACKEND_ROOT,
  SHARED_ROOT,
  BACKEND_NODE_MODULES,
  reqB,
  reqS,
  backendRequire,
};
