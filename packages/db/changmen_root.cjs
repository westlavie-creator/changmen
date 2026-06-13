"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * 从任意 packages/* 或 apps/* 子目录向上查找 changmen monorepo 根。
 */
function findChangmenRoot(fromDir) {
  let cur = fromDir;
  for (let i = 0; i < 12; i++) {
    const backendPkg = path.join(cur, "apps", "backend", "package.json");
    if (fs.existsSync(backendPkg)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(backendPkg, "utf8"));
        if (pkg.name === "@changmen/backend") return cur;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(fromDir, "..", "..");
}

module.exports = { findChangmenRoot };
