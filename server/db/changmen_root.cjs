"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * 从任意 changmen 子目录向上查找 monorepo 根。
 * 优先 `server/backend`（档 B 布局），兼容遗留 `apps/backend`。
 */
function findChangmenRoot(fromDir) {
  let cur = fromDir;
  for (let i = 0; i < 12; i++) {
    for (const backendRel of ["server/backend/package.json", "apps/backend/package.json"]) {
      const backendPkg = path.join(cur, backendRel);
      if (!fs.existsSync(backendPkg)) continue;
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
