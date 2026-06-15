"use strict";

/**
 * CJS 入口：在创建 pg 客户端之前加载 server/backend/.env。
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { findChangmenRoot } = require("./changmen_root.cjs");

const changmenRoot = findChangmenRoot(__dirname);

function hasDatabaseUrl() {
  return !!(
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  );
}

/** @param {{ prepend?: string[] }} [options] */
function loadChangmenEnv(options = {}) {
  const rels = [...(options.prepend ?? []), "server/backend/.env"];
  for (const rel of rels) {
    const envPath = path.join(changmenRoot, rel);
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    if (hasDatabaseUrl()) break;
  }
}

module.exports = { loadChangmenEnv };
loadChangmenEnv();
